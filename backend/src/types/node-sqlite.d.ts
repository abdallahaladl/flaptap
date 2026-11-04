declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;
  export type SQLOutputValue = null | number | bigint | string | Uint8Array;

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    all(...anonymousParameters: SQLInputValue[]): Record<string, any>[];
    all(namedParameters: Record<string, SQLInputValue>, ...anonymousParameters: SQLInputValue[]): Record<string, any>[];
    get(...anonymousParameters: SQLInputValue[]): Record<string, any> | undefined;
    get(namedParameters: Record<string, SQLInputValue>, ...anonymousParameters: SQLInputValue[]): Record<string, any> | undefined;
    run(...anonymousParameters: SQLInputValue[]): StatementResultingChanges;
    run(namedParameters: Record<string, SQLInputValue>, ...anonymousParameters: SQLInputValue[]): StatementResultingChanges;
  }

  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
  }

  export class DatabaseSync {
    constructor(location: string, options?: DatabaseSyncOptions);
    close(): void;
    exec(sql: string): void;
    open(): void;
    prepare(sql: string): StatementSync;
  }
}
