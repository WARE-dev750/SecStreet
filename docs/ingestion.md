# Capability Ingestion

How a real tool becomes a SecStreet capability. Every step is required.

## 1. Pick a tool that a security professional actually uses

Not `uname`. Not `sha256sum`. Real tools: `readelf`, `objdump`, `strings`,
`openssl`, `yara`, `nmap`, `tshark`, `exiftool`, `radare2`, `gdb`, `volatility`.
The test is: would a working analyst run this in the next 24 hours? If no, skip it.

## 2. Choose one specific thing it does

Not "wrap readelf." Wrap "read the ELF header." Wrap "list ELF sections."
One capability = one input shape + one output shape. If a tool does five things
worth wrapping, that is five capabilities.

## 3. Declare input and output

Input is always a JSON object. For tools that operate on files, the input is
`{ "path": string }`. For tools that operate on stdin text, `{ "text": string }`.
Output is always a JSON object with named fields. Never dump raw stdout.

## 4. Write the manifest

`capability.json` inside the capability directory. Required fields:

- `name` — kebab-case, unique
- `version` — semver
- `description` — what it does, one sentence
- `language` — `javascript`, `python`, `shell`, `binary`
- `entrypoint` — the file the runtime runs
- `inputSchema` / `outputSchema` — filenames, relative to the capability dir
- `permissions` — only what the capability actually uses
- `risk` — `low` unless the capability can cause harm
- `trust` — `community` unless it requires elevated permissions
- `provenance` — source repo, author, license, version, modifications
- `maintainer`
- `execution.timeoutMs` — always set explicitly

## 5. Write the entrypoint

Reads JSON from stdin. Writes JSON to stdout. Errors to stderr. Exit 1 on error.
Never write anything else to stdout. Never assume the input is valid.

For a tool-wrapper capability in Node:

    spawnSync(tool, [...args], { encoding: "utf8", timeout })
    parse stdout
    write JSON to stdout

Never use shell interpolation. Never trust user input as arguments. Reject
paths starting with `-`. Pass `--` before the path.

## 6. License

If you invoke an external tool as a subprocess, you are not redistributing that
tool. You are calling it. This is legal under every mainstream OSS license
including GPL. What you *are* redistributing is *this* capability directory,
which is your own code, under your own license (SecStreet's proprietary
license for official capabilities).

If you copy source code from the tool into the capability, you *are*
redistributing. Then you must respect the original license: include the notice,
match the terms. Record this in `provenance.modifications`.

Never mix the two silently. If you don't know which case you're in, you're in
the first case. Wrapping is not copying.

## 7. Write tests

In `tests/unit/<name>.test.ts`. Always:

- Run against a real file on the machine. `/bin/ls` for ELF tools.
- Verify the output has the expected shape.
- Verify a bad input is rejected cleanly.

## 8. Register

Nothing to do. The registry scans `capabilities/official/` on load. If the
manifest validates, the capability appears.

## 9. Commit

One commit per capability or per small batch. Message format:

    feat(capability): add <name> wrapping <tool>

