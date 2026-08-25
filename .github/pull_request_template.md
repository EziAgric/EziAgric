## Description
<!-- Provide a clear, detailed description of your changes -->

## Related Issues
<!-- List related issues below using 'Closes #issue-number' -->
- Closes #

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Infrastructure / CI / Policy / Documentation update

## PR Checklist
- [ ] Code builds and passes all unit & integration tests locally (`pnpm test` / `cargo test`)
- [ ] Documentation has been updated to reflect code changes
- [ ] **Admin Regression Tests**: If this PR modifies admin routes, controllers, middleware, or services, corresponding regression tests under `backend/src/__tests__/` have been added or updated (enforced by CI policy).
- [ ] **Secret Management**: No secrets, private keys, or credentials are hardcoded.
- [ ] **Network Isolation & Security**: Infrastructure changes preserve network isolation for admin endpoints.
