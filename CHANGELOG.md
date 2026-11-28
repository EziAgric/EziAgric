# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-03-24

### Added
- **Core escrow functionality**: Smart contract-based escrow with Soroban/Rust
- **Trade lifecycle management**: Create, fund, deliver, complete, dispute trades
- **User management**: Wallet-based authentication (Stellar/Freighter/Albedo)
- **Dynamic loss sharing**: Configurable risk ratios (basis points) per trade
- **Proof-of-Delivery (PoD)**: Video evidence submission and IPFS storage
- **Delivery manifests**: Driver details, vehicle info, route descriptions
- **Vault and savings goals**: Automated savings functionality
- **Dispute resolution**: Category-based disputes with mediator review
- **Distributed tracing**: OpenTelemetry integration with correlation IDs
- **Admin features**: Feature flags, batch trade operations, treasury management
- **Real-time events**: Chain event outbox for reliable event processing

### Features
- Stellar Path Payments for NGN-to-cNGN conversion
- 1% platform fee on successful trades
- JWT-based session management with refresh token rotation
- Role-based access: Buyer, Seller, Driver, Mediator, Admin

### Documentation
- Architecture Decision Records (ADRs)
- System context and trade lifecycle diagrams
- Distributed tracing guide
- Security and operations documentation

[Unreleased]: https://github.com/EziAgric/EziAgric/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/EziAgric/EziAgric/releases/tag/v0.1.0