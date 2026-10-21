// Table definitions. Only repositories import this file.
export const users = {
  table: 'users',
  columns: {
    id: 'uuid primary key',
    email: 'text not null unique',
    displayName: 'text', // column display_name; may be null or padded with spaces
    createdAt: 'timestamptz not null default now()',
  },
};
