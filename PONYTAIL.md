# Ponytail — the "lazy senior developer" rule

Source: <https://github.com/dietrichgebert/ponytail>

A plugin for Claude Code and other agents that pushes back on over-engineered
output. Reported results on real repo-editing tasks: about **54% fewer lines of
code**, 20% lower cost, 27% faster, with safety held.

## Installing it properly

It is a plugin, not a file you can paste in. Installation is an interactive
command, so it cannot be done from a non-interactive session:

```
/plugin marketplace add dietrichgebert/ponytail
/ponytail full          # lite | full | ultra | off
/ponytail-review        # review the current diff
```

Until then, the method below is applied by hand.

## The decision ladder

Before writing anything, walk down this list and stop at the first hit:

1. **Does this need to exist?** No → skip it. YAGNI.
2. **Already in this codebase?** → reuse it, do not rewrite it.
3. **Does the standard library do it?** → use that.
4. **Is it a native platform feature?** → use that.

Only if all four fail do you write new code.

> The best code is the code you never wrote.

## How this applies to this project

The site has no build step and no framework, so there is no bundler to tree
shake anything. Dead CSS and JS ship to every visitor and cost real bytes and
real parse time. That makes the rule sharper here than it would be elsewhere:

- **A stylesheet on a page that uses none of its selectors is dead weight.**
  Check by selector, not by guess. Removing `aiplus.css` from solutions.html on
  the basis of one marker class left fifteen classes unstyled.
- **A retired feature must be deleted, not disabled.** `enhance.css` carried
  `[data-tilt] { transform: none !important }` for a tilt that had been switched
  off. That corpse silently broke its replacement.
- **Prefer a platform feature to a hand-rolled one.** `offset-path` moves the
  packets in `analyst.css`; `translate` centres the drum cards so JS keeps sole
  ownership of `transform`.
- **Reuse before adding.** The rail, the reveal system and the drum are each
  used by several sections. A new section should reach for those first.

## Applying it

`git log --oneline --grep="clear out"` for the passes already done, and see
CLAUDE.md section 3 for what must never be deployed.
