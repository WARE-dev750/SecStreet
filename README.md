# SecStreet

SecStreet is a cybersecurity development platform. It turns security functionality
into standard capabilities that can be described, discovered, installed, executed,
composed, verified, and audited inside a project.

## License

Proprietary. All Rights Reserved. See LICENSE.

Community contributions require a signed Contributor License Agreement.

## What works today

- Capability contract: declarative manifest.
- Registry: validates every manifest strictly.
- Runtime: executes by language; honors timeoutMs, env, cwd; enforces permissions against trust tiers.
- Workflow engine: chains by output to input; auto-inserts adapters; supports step conditions with cascade skip.
- Project: init, add, remove, list, verify. Records sha256 integrity on install.
- Integrity: tampered capabilities cannot run.
- Audit: append-only log of every run and workflow step.
- Signing: ed25519 keygen, trust, sign, keys. Verified-tier installs require a trusted signature.
- Library index: signed manifest of a whole capability library with per-capability integrity and signature.
- Cross-language: Node, Python, shell chain in one workflow.

## Trust tiers

- community: no permissions by default.
- professional: filesystem read, env read, subprocess.
- verified: adds filesystem write and network. Requires signature.
- restricted: every permission. Requires signature.

## Contact

legal@secstreet.dev
