# SecStreet

SecStreet is a cybersecurity development platform that combines a security-focused IDE, a capability library, project management, workflows, runtime execution, AI-assisted development, and security research tools.

The project is designed around reusable security capabilities that can be described, discovered, tested, adapted, and combined inside projects.

## Components

### IDE

The SecStreet IDE is the main development environment.

It is intended to provide:

* Code editing
* Security capabilities
* Capability discovery
* Project management
* Workflows
* Testing
* Documentation
* AI assistance
* Local and remote execution
* Package management
* Research tools

### Capability Library

The capability library stores reusable pieces of security functionality.

Capabilities can contain information about:

* Inputs
* Outputs
* Language
* Dependencies
* Operating system
* Version
* License
* Permissions
* Required environment
* Security risk
* Trust level
* Tests
* Source
* Maintainer
* Compatibility

The goal is to allow users to search for functionality instead of searching only for complete projects or repositories.

## Compatibility

SecStreet is intended to support security components written in different languages, frameworks, and environments.

The compatibility system is responsible for areas such as:

* Interface adaptation
* Type conversion
* Input and output translation
* API adapters
* Dependency resolution
* Version checks
* Environment checks
* Integration testing

## Runtime

The runtime is responsible for executing capabilities and projects.

It is intended to provide:

* Environment management
* Dependency management
* Execution
* Logging
* Testing
* Permission enforcement
* Sandboxing where appropriate
* Resource management
* Results
* Project state

## Workflows

SecStreet can represent security processes as workflows made from connected capabilities.

A workflow may contain:

* Inputs
* Outputs
* Capabilities
* Conditions
* Branches
* Loops
* Scheduling
* Testing
* Logging
* Human approval
* AI-assisted decisions

## AI

AI is an integrated component of SecStreet rather than the entire system.

Potential uses include:

* Code generation
* Code explanation
* Capability discovery
* Code adaptation
* Compatibility analysis
* Debugging
* Documentation
* Research
* Workflow creation
* Testing
* Project assistance

SecStreet is intended to support local models, cloud models, and private organizational models.

## Open-Source Integration

SecStreet is intended to work with existing open-source security projects rather than recreate all functionality internally.

Integrated capabilities should retain information about their original source, license, version, dependencies, modifications, and other relevant metadata.

## Security

SecStreet is intended for legitimate security development, research, CTFs, labs, and authorized security assessments.

Capabilities can have different permissions, trust requirements, risk levels, and execution controls.

Package and capability security includes areas such as:

* Provenance
* Source verification
* Versioning
* Integrity
* Signatures
* Dependency information
* License information
* Testing
* Maintainer information
* Access controls

## Project Structure

The repository is organized around the following major areas:

```text
SecStreet/
├── apps/
├── packages/
├── capabilities/
├── services/
├── infrastructure/
├── tests/
├── docs/
├── scripts/
└── configs/
```

The `packages` directory contains the main platform components and shared contracts.

The `capabilities` directory contains capability implementations and examples.

## Current Status

SecStreet is under active development.

The initial development focus is the core capability system:

1. Define a capability format
2. Build the capability registry
3. Add capability discovery
4. Implement metadata and provenance
5. Add compatibility checking
6. Add adapters
7. Execute capabilities through the runtime
8. Test capability composition
9. Integrate AI assistance
10. Build the initial IDE experience

The first technical goal is to demonstrate that existing security functionality can be represented as SecStreet capabilities and reliably combined inside a project.

## License

License information will be added as the project develops.
