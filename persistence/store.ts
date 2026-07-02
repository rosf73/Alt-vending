// 영속 저장소 — SQLite (better-sqlite3). INV-1: 재시작/새로고침 후 상태 유지.
// 단일 공유 상태(INV-2)를 단일 행 JSON으로 원자적 저장. better-sqlite3는 동기 →
// 서버 요청 핸들러 내에서 read-modify-write가 직렬화된다 (아키텍처 §5.5).
import Database from 'better-sqlite3';
import { createMachine } from '../domain/machine.js';
import type { Machine } from '../domain/types.js';

export class VendingStore {
  private db: Database.Database;

  /** @param filename SQLite 파일 경로. ':memory:'는 테스트용 인메모리. */
  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)`);
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

  /** 상태를 초기 시드로 리셋 (개발/테스트 편의). */
  reset(): Machine {
    const m = createMachine();
    this.persist(m);
    return m;
  }

  close(): void {
    this.db.close();
  }
}
