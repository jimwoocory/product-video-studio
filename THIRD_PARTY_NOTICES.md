# Third-Party Notices

Policy baseline: P0 V0.2
Last reviewed: 2026-09-28

This file records third-party code, packages and external runtimes approved for Product Video Studio P0. Approval is default-deny and must match `dependency-allowlist.json`.

## Bundled npm dependency inventory

The lockfile currently resolves 34 exact npm package versions. Installation is allowed only while `npm run license:gate` passes against the exact lockfile.

| Package | Version | License | Scope |
| --- | --- | --- | --- |
| @prisma/client | 6.12.0 | Apache-2.0 | production |
| @prisma/config | 6.12.0 | Apache-2.0 | transitive |
| @prisma/debug | 6.12.0 | Apache-2.0 | transitive |
| @prisma/engines-version | 6.12.0-15.8047c96bbd92db98a2abc7c9323ce77c02c89dbc | Apache-2.0 | transitive |
| @prisma/engines | 6.12.0 | Apache-2.0 | transitive |
| @prisma/fetch-engine | 6.12.0 | Apache-2.0 | transitive |
| @prisma/get-platform | 6.12.0 | Apache-2.0 | transitive |
| @types/node | 26.6.3 | MIT | development |
| @typescript/typescript-aix-ppc64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-darwin-arm64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-darwin-x64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-freebsd-arm64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-freebsd-x64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-linux-arm | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-linux-arm64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-linux-loong64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-linux-mips64el | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-linux-ppc64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-linux-riscv64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-linux-s390x | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-linux-x64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-netbsd-arm64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-netbsd-x64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-openbsd-arm64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-openbsd-x64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-sunos-x64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-win32-arm64 | 7.0.2 | Apache-2.0 | transitive |
| @typescript/typescript-win32-x64 | 7.0.2 | Apache-2.0 | transitive |
| image-size | 2.0.4 | MIT | production |
| jiti | 2.4.2 | MIT | transitive |
| prisma | 6.12.0 | Apache-2.0 | development |
| typescript | 7.0.2 | Apache-2.0 | development |
| undici-types | 8.9.0 | MIT | transitive |
| zod | 4.6.5 | MIT | production |

License texts are archived after installation under `third_party/licenses/npm/`.

## Domestic Jimeng official dreamina CLI

Classification: external runtime, not bundled.
Current environment status: official Dreamina CLI 1.4.18 installed and OAuth-authorized as of 2026-09-27.
Official installer page: https://jimeng.jianying.com/ai-tool/install
Verified executable: `C:\Users\Administrator\bin\dreamina.exe`
Verified SHA-256: `13A817E455179AB994495EEDB875CF845348D05F526B21C2EF207E1FC47F6014`
ProviderIdentity is VERIFIED before submit, with version/help/account capability evidence archived by the application.
Third-party Jimeng/Dreamina reverse-engineered CLIs and MIT wrappers are not approved P0 runtime dependencies or fallbacks.

## Hermes Agent structured AI runtime

Classification: external runtime, not bundled.  
Version reviewed: 0.21.3 (local install reports upstream commit 5dd70d7c).  
Upstream: https://github.com/NousResearch/hermes-agent  
License: MIT, Copyright (c) 2025 Nous Research.  
Purpose: structured JSON generation for Product Truth, Creative, Script and Product Director outputs.  
The project calls the installed `hermes` executable as an external process; Hermes source code and its Python/Node dependency tree are not vendored into Product Video Studio. The runtime must be locally version/source verified before use. License text is archived at `third_party/licenses/hermes-agent-0.21.3-LICENSE`.

## FFmpeg external runtime

Classification: external system runtime, not bundled.  
Current reviewed runtime: FFmpeg 9.0.1 full build on the development machine.  
Upstream: https://ffmpeg.org/  
License reported by the installed build: GPL-3.0-or-later.  
Purpose: concatenate already accepted generated clips into the final MP4. Product Video Studio does not redistribute the FFmpeg binary. The License Gate exception applies only to this explicitly registered non-bundled external runtime; GPL packages or vendored GPL code remain denied.

## Douyin OpenAPI

Classification: external official service, not bundled.  
Official platform: https://open.douyin.com/  
Purpose: OAuth user authorization plus `video.create` upload/create APIs for explicit user-confirmed publishing to Douyin. Client secrets and user access tokens are kept outside project artifacts under `.runtime-secrets/` and are never exported into `project.json`.

## Prohibited license classes

The P0 License Gate rejects GPL, AGPL, SSPL, UNKNOWN, NOASSERTION, unlicensed/no-LICENSE sources and any dependency not explicitly allowlisted. The rule applies to direct dependencies, transitive dependencies, vendored files and copied source. The only GPL exception is the explicitly registered, non-bundled FFmpeg system runtime; no GPL code or binary is distributed with this project.
