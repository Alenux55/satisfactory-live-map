/** Split `Name <addr@host>` or a bare address into display name + mailbox. */
export function parseFromHeader(from: string): { name: string; address: string } {
  const trimmed = from.trim();
  if (!trimmed) return { name: "", address: "" };
  const angled = /^(?:"([^"]*)"|([^<]*?))?\s*<([^>]+)>\s*$/.exec(trimmed);
  if (angled) {
    return { name: (angled[1] ?? angled[2] ?? "").trim(), address: angled[3].trim() };
  }
  return { name: "", address: trimmed };
}

/** Build an RFC 5322 From value. Name is optional; address is the mailbox. */
export function formatFromHeader(name: string, address: string): string {
  const addr = address.trim();
  const n = name.trim();
  if (!addr) return n;
  if (!n) return addr;
  const quoted = `"${n.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `${quoted} <${addr}>`;
}
