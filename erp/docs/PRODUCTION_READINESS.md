# Production Readiness

Status: verification in progress.

## Release gates
- [ ] ERP JavaScript syntax checks pass
- [ ] ERP contract tests pass
- [ ] Migration ordering/preflight passes
- [ ] School provisioning and first-admin flow passes
- [ ] Offline sync contracts pass
- [ ] Teacher class/subject marks authorization passes
- [ ] Local storage connector contracts pass
- [ ] Android release build passes
- [ ] Production environment secrets/configuration supplied
- [ ] Database backup/restore procedure tested

Production release is considered ready only after all automated gates pass and the production database/environment has been configured outside the repository.