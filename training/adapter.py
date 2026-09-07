#!/usr/bin/env python3
"""
adapter.py — aing-env EnvAdapter（训练三件套之一）

实现 SkillOpt `skillopt.envs.base.EnvAdapter` 的四个抽象接口：
    build_train_env(batch_size, seed)      -> list[task]
    build_eval_env(env_num, split, seed)   -> list[task]
    rollout(env_manager, skill_content, out_dir) -> list[{id, hard, soft, ...}]
    get_task_types()                       -> list[str]

设计要点：
- 离线确定性评分：rollout 不调 LLM，直接衡量"技能文档内容"对任务包
  正确口径的覆盖度（docfaithful 式），错误口径出现则扣分——
  这正是"训练技能文档"的本义，且影子模式零 API 成本、完全可复现。
- 反馈信号接入：rollout 会读 knowledge.db 的 metabolism_log（三件套之三），
  取最近两次运行的 kespi_before/after 斜率作为环境健康系数
  （代谢在恶化 → 环境奖励整体打折），把训练与真实代谢状态挂钩。
- 轨迹落盘：每个任务在 out_dir 写 JSONL 轨迹，供默认 reflect() 消费。
- 未安装 skillopt 时自动退化为本地 ABC（接口签名一致），
  因此本文件可在 aing 包内独立冒烟，装好 SkillOpt 后无缝接入。

冒烟（不依赖 skillopt）：
    python adapter.py --smoke
    # 基线技能（真蓝图）应显著高于被污染技能 → Gate 有区分度
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
from pathlib import Path

try:  # 装了 SkillOpt 就用真接口，没装则本地等价降级
    from skillopt.envs.base import EnvAdapter  # type: ignore
    SKILLOPT = True
except Exception:  # pragma: no cover - 降级路径
    from abc import ABC, abstractmethod

    class EnvAdapter(ABC):  # 与 skillopt.envs.base.EnvAdapter 签名一致
        def setup(self, cfg: dict) -> None: ...
        @abstractmethod
        def build_train_env(self, batch_size: int, seed: int, **kwargs): ...
        @abstractmethod
        def build_eval_env(self, env_num: int, split: str, seed: int, **kwargs): ...
        @abstractmethod
        def rollout(self, env_manager, skill_content: str, out_dir: str, **kwargs): ...
        @abstractmethod
        def get_task_types(self) -> list[str]: ...

    SKILLOPT = False

PKG_DIR = Path(__file__).resolve().parent
DEFAULT_TASKS = PKG_DIR / "task-package.json"
DEFAULT_DB = PKG_DIR.parent / "knowledge.db"


def _det_shuffle(items: list, seed: int) -> list:
    """确定性洗牌（无 random 全局态，跨进程可复现）。"""
    return sorted(items, key=lambda t: hashlib.md5(f"{seed}:{t['id']}".encode()).hexdigest())


class AingEnvAdapter(EnvAdapter):
    def __init__(
        self,
        tasks_path: str | os.PathLike = DEFAULT_TASKS,
        db_path: str | os.PathLike = DEFAULT_DB,
        eval_ratio: float = 0.3,
        seed: int = 42,
        workers: int = 4,
        analyst_workers: int = 4,
        failure_only: bool = False,
        minibatch_size: int = 8,
        edit_budget: int = 4,
        max_completion_tokens: int = 4096,
        **kwargs,
    ) -> None:
        self.tasks_path = Path(tasks_path)
        self.db_path = Path(db_path)
        self.eval_ratio = eval_ratio
        self.seed = seed
        self.workers = workers
        self.analyst_workers = analyst_workers
        self.failure_only = failure_only
        self.minibatch_size = minibatch_size
        self.edit_budget = edit_budget
        self.max_completion_tokens = int(max_completion_tokens)
        self._pkg = json.loads(self.tasks_path.read_text(encoding="utf-8"))
        self._tasks: list[dict] = self._pkg["tasks"]

    # ── Lifecycle ─────────────────────────────────────────────────────

    def setup(self, cfg: dict) -> None:
        super().setup(cfg)

    # ── Env construction ──────────────────────────────────────────────

    def _split(self) -> tuple[list[dict], list[dict]]:
        """按 task_type 分层切 train/eval，保证每域在两边都有代表。"""
        train, ev = [], []
        by_type: dict[str, list[dict]] = {}
        for t in self._tasks:
            by_type.setdefault(t["task_type"], []).append(t)
        for _, items in sorted(by_type.items()):
            items = _det_shuffle(items, self.seed)
            n_eval = max(1, round(len(items) * self.eval_ratio))
            ev.extend(items[:n_eval])
            train.extend(items[n_eval:])
        return train, ev

    def build_env_from_batch(self, batch, **kwargs):
        return list(batch or [])

    def build_train_env(self, batch_size: int, seed: int, **kwargs):
        train, _ = self._split()
        picked = _det_shuffle(train, seed)[:batch_size] if batch_size else train
        return self.build_env_from_batch(picked, **kwargs)

    def build_eval_env(self, env_num: int, split: str, seed: int, **kwargs):
        if split in ("eval", "val", "test"):
            _, picked = self._split()
        else:
            picked, _ = self._split()
        picked = _det_shuffle(picked, seed)
        return self.build_env_from_batch(picked[:env_num] if env_num else picked, **kwargs)

    # ── Feedback signal（三件套之三：metabolism_log 反馈） ─────────────

    def metabolism_health(self) -> float:
        """最近两次代谢的 kespi 斜率 → 环境健康系数 [0.9, 1.0]。"""
        if not self.db_path.exists():
            return 1.0
        try:
            conn = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
            rows = conn.execute(
                "SELECT DISTINCT run_id, kespi_before, kespi_after "
                "FROM metabolism_log ORDER BY created_at DESC LIMIT 2"
            ).fetchall()
            conn.close()
        except sqlite3.Error:
            return 1.0
        if len(rows) < 2:
            return 1.0
        prev_after, last_after = rows[1][2], rows[0][2]
        if prev_after is None or last_after is None:
            return 1.0
        slope = last_after - prev_after
        # 代谢改善(斜率>0)→1.0；恶化→线性打折，下限 0.9
        return round(max(0.9, 1.0 + min(0.0, slope * 2.0)), 4)

    # ── Rollout ───────────────────────────────────────────────────────

    @staticmethod
    def _cjk_bigrams(text: str) -> set[str]:
        """中文按 bigram 切分（无分词器下的覆盖度标准做法）。"""
        grams: set[str] = set()
        for run in re.findall(r"[\u4e00-\u9fff]{2,}", text):
            if len(run) == 2:
                grams.add(run)
            else:
                grams |= {run[i:i + 2] for i in range(len(run) - 1)}
        return grams

    @classmethod
    def _terms(cls, text: str) -> set[str]:
        """拉丁词整词 + 中文 bigram，统一小写。"""
        tokens = {t.lower() for t in re.findall(r"[a-zA-Z][a-zA-Z0-9_-]{2,}|\d+\.\d+", text)}
        return tokens | cls._cjk_bigrams(text)

    def _score_task(self, skill_content: str, task: dict) -> dict:
        """docfaithful 离线评分：正确口径 bigram 覆盖加分，错误口径出现扣分。"""
        skill_l = skill_content.lower()
        skill_grams = self._cjk_bigrams(skill_l)
        c_terms = self._terms(task["correct_answer"])
        w_terms = self._terms(task["wrong_answer"]) - c_terms

        def covered(term: str) -> bool:
            return (term in skill_grams) if re.fullmatch(r"[\u4e00-\u9fff]{2}", term) \
                else (term in skill_l)

        if not c_terms:
            soft = 0.0
        else:
            hit = sum(1 for t in c_terms if covered(t))
            soft = hit / len(c_terms)
        wrong_hits = sum(1 for t in w_terms if covered(t))
        soft -= 0.15 * wrong_hits / max(1, len(w_terms))
        soft = max(0.0, min(1.0, soft))
        hard = 1 if soft >= 0.5 else 0
        return {"id": task["id"], "hard": hard, "soft": round(soft, 4),
                "task_type": task["task_type"]}

    def rollout(self, env_manager, skill_content: str,
                out_dir: str, **kwargs) -> list[dict]:
        items: list[dict] = env_manager
        os.makedirs(out_dir, exist_ok=True)
        health = self.metabolism_health()
        results = []
        for task in items:
            r = self._score_task(skill_content, task)
            r["env_health"] = health
            r["soft"] = round(r["soft"] * health, 4)  # 代谢恶化 → 环境奖励打折
            r["hard"] = 1 if r["soft"] >= 0.6 else 0
            traj = {
                "id": r["id"],
                "question": task["question"],
                "skill_excerpt": skill_content[:500],
                "scored": r,
            }
            with open(os.path.join(out_dir, f"{r['id']}.jsonl"), "w", encoding="utf-8") as f:
                f.write(json.dumps(traj, ensure_ascii=False) + "\n")
            results.append(r)
        return results

    # ── Task types ────────────────────────────────────────────────────

    def get_task_types(self) -> list[str]:
        seen: list[str] = []
        for t in self._tasks:
            tt = str(t.get("task_type") or "docfaithful")
            if tt not in seen:
                seen.append(tt)
        return seen or ["docfaithful"]


# ── 冒烟：基线技能 vs 污染技能，验证 Gate 端到端区分度 ─────────────────

def _smoke() -> None:
    adapter = AingEnvAdapter()
    env = adapter.build_eval_env(env_num=0, split="eval", seed=42)
    print(f"skillopt installed: {SKILLOPT}")
    print(f"tasks: {len(adapter._tasks)} (eval split: {len(env)})")
    print(f"task_types: {adapter.get_task_types()}")
    print(f"metabolism_health: {adapter.metabolism_health()}")

    raw_dir = PKG_DIR.parent / "raw"
    baseline = "\n".join(
        p.read_text(encoding="utf-8") for p in sorted(raw_dir.glob("*.md"))
    ) if raw_dir.exists() else ""
    # 污染：对真实蓝图的口径做系统性篡改（模拟越改越坏的候选）
    corrupted = (baseline
        .replace("0.65", "0.75")
        .replace("0.80", "0.90")
        .replace("mz-<original_id>", "seed2-<id>")
        .replace("seed-<entityId>", "uuid-<n>")
        .replace("best / merge / council", "best 单一模式")
        .replace("Aggregate→Select", "Select")
        .replace("access_count", "expired_at"))

    res_good = adapter.rollout(env, baseline, str(PKG_DIR / "runs" / "smoke-good"))
    res_bad = adapter.rollout(env, corrupted, str(PKG_DIR / "runs" / "smoke-bad"))
    avg = lambda rs: sum(r["soft"] for r in rs) / len(rs)
    hard = lambda rs: sum(r["hard"] for r in rs) / len(rs)
    print(f"baseline skill : soft={avg(res_good):.3f} hard={hard(res_good):.3f}")
    print(f"corrupted skill: soft={avg(res_bad):.3f} hard={hard(res_bad):.3f}")
    verdict = "✅ Gate 有区分度（污染技能显著劣于基线）" if avg(res_good) > avg(res_bad) + 0.02 \
        else "❌ 无区分度，需复核任务包"
    print(verdict)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true")
    args = ap.parse_args()
    if args.smoke:
        _smoke()
    else:
        print(__doc__)
