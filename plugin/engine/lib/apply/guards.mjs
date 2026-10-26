// The write gate. Every path that mutates Sitecore calls this first.
//   - the client/adapter must have been created with writes enabled;
//   - the caller must confirm the environment by name (`confirm === target.env`);
//   - a production target additionally needs `prod: true` (the CLI's --prod).
export function assertWritable(target, { confirm, prod = false } = {}) {
  if (!target?.writable) throw new Error('Client is read-only (dry run); create it with allowWrites to write');
  if (!confirm || confirm !== target.env) throw new Error(`Writes need --confirm ${target.env} (got ${confirm ? `"${confirm}"` : 'nothing'})`);
  if (target.isProd && !prod) throw new Error(`"${target.env}" is production; writes need --prod as well as --confirm`);
}
