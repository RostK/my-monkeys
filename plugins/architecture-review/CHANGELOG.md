# Changelog

All notable changes to **architecture-review** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this plugin adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-13

### Added
- Initial release: generalized read-only `architecture-reviewer` agent (onion + feature-based frontend
  topology checks; Violation/Smell/Nit tiering with `path:line` citations).
- Declares a dependency on `engineering-paved-path` `^1.0.0` (the reviewer preloads its architecture,
  validation, security, and TypeScript skills).
