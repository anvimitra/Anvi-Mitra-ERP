# Anvi Mitra ERP

A general-purpose, multi-school, multi-branch School ERP platform designed for schools of different sizes.

## Architecture
- Web administration portal
- School/branch scoped data
- Role-aware authentication
- Academic setup: sessions, classes, sections and subjects
- Admissions and student enrollment foundation
- Attendance, examinations and results foundation
- Fees, reports and parent/teacher portals planned as modular services
- Mobile-app API foundation for a separate app per school

## Examination model
The academic model supports multiple assessment events, including **FA1, FA2, FA3, Half Yearly and Yearly**, with room for additional exams without changing the core student model.

## Safety rule
This repository is the dedicated ERP codebase. The existing `LSKLive` website remains separate and should not be modified as part of normal ERP development.

## Development
Node.js 20+ is recommended for the API. PostgreSQL is the primary database target. Local backup/export workflows will be supported as a secondary recovery layer.
