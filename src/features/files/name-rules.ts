/** NameForm's rules, shared by sheet and tree: trim, explain slashes and use dashes. */
export function nameRules(value: string): { name: string; notice: string | null } {
  return {
    name: value.trim().replace(/[/\\]/g, '-'),
    notice: /[/\\]/.test(value) ? 'Names cannot have slashes; Bower used a dash.' : null,
  };
}
