// 영속 저장소 — SQLite (better-sqlite3). INV-1: 재시작/새로고침 후 상태 유지.
// 단일 공유 상태(INV-2)를 단일 행 JSON으로 원자적 저장. better-sqlite3는 동기 →
// 서버 요청 핸들러 내에서 read-modify-write가 직렬화된다 (아키텍처 §5.5).
import Database from 'better-sqlite3';
import { createMachine } from '../domain/machine.js';
import type { Machine } from '../domain/types.js';
import type { AuditEntry, NewAuditEntry } from '../domain/audit.js';

export class VendingStore {
  private db: Database.Database;

  /** @param filename SQLite 파일 경로. ':memory:'는 테스트용 인메모리. */
  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)`);
    // 감사 로그 (append-only) — B-3.4: 시각·유형·상세·결과 + 변경 전/후 (INV-1 영속)
    this.db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      type TEXT NOT NULL,
      detail TEXT NOT NULL,
      result TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT
    )`);
    if (!this.db.prepare('SELECT 1 FROM state WHERE id = 1').get()) {
      this.persist(createMachine()); // 최초 시드 (§3.2)
    }
  }

  /** 현재 상태 로드. (INV-1) */
  load(): Machine {
    const row = this.db.prepare('SELECT json FROM state WHERE id = 1').get() as { json: string } | undefined;
    if (!row) {
      const m = createMachine();
      this.persist(m);
      return m;
    }
    return JSON.parse(row.json) as Machine;
  }

  /** 상태 영속 저장 (INV-1). */
  persist(machine: Machine): void {
    this.db.prepare('INSERT OR REPLACE INTO state (id, json) VALUES (1, ?)').run(JSON.stringify(machine));
  }

  /** 감사 로그 1건 적재 (append-only, B-3.4). 시각은 여기서 부여. */
  appendAudit(entry: NewAuditEntry): void {
    this.db
      .prepare('INSERT INTO audit_log (at, type, detail, result, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(new Date().toISOString(), entry.type, entry.detail, entry.result, entry.before, entry.after);
  }

  /** 최근 감사 로그 조회 (최신순). REQ-B11 조회. */
  listAudit(limit = 200): AuditEntry[] {
    const rows = this.db
      .prepare('SELECT id, at, type, detail, result, before_json, after_json FROM audit_log ORDER BY id DESC LIMIT ?')
      .all(limit) as Array<Record<string, string | number | null>>;
    return rows.map((r) => ({
      id: r.id as number,
      at: r.at as string,
      type: r.type as AuditEntry['type'],
      detail: r.detail as string,
      result: r.result as AuditEntry['result'],
      before: (r.before_json as string | null) ?? null,
      after: (r.after_json as string | null) ?? null,
    }));
  }

  /** 상태를 초기 시드로 리셋 (개발/테스트 편의). 감사 로그도 함께 비운다. */
  reset(): Machine {
    const m = createMachine();
    this.persist(m);
    this.db.exec('DELETE FROM audit_log');
    return m;
  }

  close(): void {
    this.db.close();
  }
}
