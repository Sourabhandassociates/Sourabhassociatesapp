INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('01ceb397-56db-4ea2-8764-8f39c4696a9a',
 'DASHBOARD.VIEW',
 'DASHBOARD',
 'VIEW',
 'View Dashboard',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('3bd03e5d-3ab7-4574-9769-838a267b99e3',
 'CASES.VIEW_ALL',
 'CASES',
 'VIEW_ALL',
 'View All Cases',
 NULL,
 true,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('2b54159f-b26e-444d-b42a-5fa48f92cc70',
 'CASES.VIEW_ASSIGNED',
 'CASES',
 'VIEW_ASSIGNED',
 'View Assigned Cases',
 NULL,
 true,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('de9b08d8-217f-42e1-8494-56a7971d2ebb',
 'CASES.CREATE',
 'CASES',
 'CREATE',
 'Create Case',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('2f8dbd3d-69ad-4d38-9d91-ba33a1ad27f6',
 'CASES.EDIT',
 'CASES',
 'EDIT',
 'Edit Case Details',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('dc01d2e1-2130-4082-9344-915284a56150',
 'CASES.CHANGE_STATUS',
 'CASES',
 'CHANGE_STATUS',
 'Change Case Status/Stage',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('b29145a5-fa46-4c63-864a-f4a8f5ccc9ae',
 'CASES.MANAGE_ADVOCATES',
 'CASES',
 'MANAGE_ADVOCATES',
 'Add/Remove Advocates',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('6247476e-fff0-4984-9fb1-aff62db1b11e',
 'CASES.DELETE',
 'CASES',
 'DELETE',
 'Delete Case (soft)',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('f24853e8-f56a-48a5-a6fc-fc08f815f4c0',
 'CASES.REASSIGN',
 'CASES',
 'REASSIGN',
 'Reassign Case to a Different Partner',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('3549c462-b135-412b-a266-5a67d24a4eeb',
 'CASES.RESTORE',
 'CASES',
 'RESTORE',
 'Restore Case',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('9ddf4d0b-597c-4a25-a980-f4d00147f40f',
 'CASES.PERMANENT_DELETE',
 'CASES',
 'PERMANENT_DELETE',
 'Permanently Delete Case',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('b5ad5f00-4392-440b-a03c-c6bbdc01d6f4',
 'CLIENTS.VIEW_ALL',
 'CLIENTS',
 'VIEW_ALL',
 'View All Clients',
 NULL,
 true,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('19d9353c-7d7c-4da4-8265-6f3c1831fc6f',
 'CLIENTS.VIEW_ASSIGNED',
 'CLIENTS',
 'VIEW_ASSIGNED',
 'View Case-Linked Clients',
 NULL,
 true,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('d677d73d-6a24-446d-a196-9dbe379f7f65',
 'CLIENTS.CREATE',
 'CLIENTS',
 'CREATE',
 'Create Client',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('d44062b0-4167-4302-8790-e73e821dc50f',
 'CLIENTS.EDIT',
 'CLIENTS',
 'EDIT',
 'Edit Client Profile',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('eec856e2-fefc-4c80-8033-820431d1f5cb',
 'CLIENTS.CHANGE_STATUS',
 'CLIENTS',
 'CHANGE_STATUS',
 'Change Client Status',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('d9fd5673-99d5-417a-bd96-52a36dc00182',
 'CLIENTS.DELETE',
 'CLIENTS',
 'DELETE',
 'Delete Client (soft)',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('0802851b-4ea8-4d6d-9008-84a3cca26858',
 'CLIENTS.RESTORE',
 'CLIENTS',
 'RESTORE',
 'Restore Client',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('accd23ac-31e9-4077-b0a3-d09bf799d748',
 'CLIENTS.PERMANENT_DELETE',
 'CLIENTS',
 'PERMANENT_DELETE',
 'Permanently Delete Client',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('fc62d926-7322-4fe0-a87a-35987bf3bb43',
 'CLIENTS.MANAGE_PORTAL_ACCESS',
 'CLIENTS',
 'MANAGE_PORTAL_ACCESS',
 'Manage Client Portal Permissions',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('192369db-0acd-48d5-a7c6-bf11abb6c408',
 'TASKS.VIEW_ALL',
 'TASKS',
 'VIEW_ALL',
 'View All Tasks (firm-wide)',
 NULL,
 true,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('d4827c21-1d8c-45e1-8a9b-8da8aacd00c7',
 'TASKS.VIEW_ASSIGNED',
 'TASKS',
 'VIEW_ASSIGNED',
 'View Tasks on Accessible Cases',
 NULL,
 true,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('5ec46291-8452-4be8-b02e-307dafde5e32',
 'TASKS.VIEW_OWN',
 'TASKS',
 'VIEW_OWN',
 'View My Tasks',
 NULL,
 true,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('79bb2dcf-4a46-4d99-83b6-c0af14d1573f',
 'TASKS.CREATE',
 'TASKS',
 'CREATE',
 'Create Task',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('f586849c-ddfb-41fa-a812-6d1df24a5b0b',
 'TASKS.EDIT',
 'TASKS',
 'EDIT',
 'Edit Task Details',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('07f9b48c-6953-40df-9c90-7f7aa5cb1344',
 'TASKS.CHANGE_STATUS',
 'TASKS',
 'CHANGE_STATUS',
 'Update Task Status',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('d0c4bcc5-bc1b-4385-9d3d-7aa6712862fe',
 'TASKS.ASSIGN',
 'TASKS',
 'ASSIGN',
 'Reassign Task',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('ca768223-84f8-4be6-a1f0-060a20933bdd',
 'TASKS.DELETE',
 'TASKS',
 'DELETE',
 'Delete Task (soft)',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('8d6af2be-bb15-42da-a98f-d24793541606',
 'TASKS.RESTORE',
 'TASKS',
 'RESTORE',
 'Restore Task',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('c3b4ad78-a784-4d80-8058-d3e45d66ec28',
 'TASKS.PERMANENT_DELETE',
 'TASKS',
 'PERMANENT_DELETE',
 'Permanently Delete Task',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('2be5ae6c-73a8-4ef8-9d29-6d79842058d8',
 'HEARINGS.VIEW',
 'HEARINGS',
 'VIEW',
 'View Hearings',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('6cc5989e-0cca-46ac-96bf-44cd9bdae869',
 'HEARINGS.CREATE',
 'HEARINGS',
 'CREATE',
 'Schedule Hearing',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('eb0175e9-6d0d-4932-bb42-e6394187673d',
 'HEARINGS.EDIT',
 'HEARINGS',
 'EDIT',
 'Reschedule / Record Outcome',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('b3cfe375-538b-4bce-95da-a0f16282c2a5',
 'CASE_NOTES.VIEW',
 'CASE_NOTES',
 'VIEW',
 'View Case Notes / Diary',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('e4fa7447-00e6-48cc-8cf5-6993c27d8f49',
 'CASE_NOTES.CREATE',
 'CASE_NOTES',
 'CREATE',
 'Add Case Note',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('b1118441-c3fc-4127-b40a-1427b8579637',
 'DOCUMENTS.VIEW',
 'DOCUMENTS',
 'VIEW',
 'View Documents',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('25eb78ba-0f1b-4f98-9393-64238f652e9b',
 'DOCUMENTS.UPLOAD',
 'DOCUMENTS',
 'UPLOAD',
 'Upload / Add Version',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('419ae11e-1fa2-497a-bdee-a026ab2b549b',
 'DOCUMENTS.DELETE',
 'DOCUMENTS',
 'DELETE',
 'Delete Document (soft)',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('d8f22a86-f8a2-40ed-b3bd-d9da889f5c89',
 'DOCUMENTS.RESTORE',
 'DOCUMENTS',
 'RESTORE',
 'Restore Document',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('4f096ce3-9327-4dac-82a4-cda19d1cd405',
 'DOCUMENTS.PERMANENT_DELETE',
 'DOCUMENTS',
 'PERMANENT_DELETE',
 'Permanently Delete Document',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('0d2b5c7e-a6d4-4a1e-9a2a-7885e9191752',
 'DOCUMENTS.APPROVE',
 'DOCUMENTS',
 'APPROVE',
 'Approve Document (reserved)',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('9024819b-04ec-4940-947a-283e5dd2376d',
 'CALENDAR.VIEW',
 'CALENDAR',
 'VIEW',
 'View Hearing Calendar',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('1ae20508-acb8-492f-b5a3-f1990ceee324',
 'EMPLOYEE_AUDIT.VIEW',
 'EMPLOYEE_AUDIT',
 'VIEW',
 'View Employee Task Audit',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('45060d36-bd17-4540-bdb2-567df58bdf71',
 'RECYCLE_BIN.VIEW',
 'RECYCLE_BIN',
 'VIEW',
 'View Recycle Bin',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('0c84568c-bd0b-445b-be52-bae5a89ee8cc',
 'USERS.VIEW',
 'USERS',
 'VIEW',
 'View User Accounts (admin list)',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('e4745f47-358f-44e5-89e0-f62a4296b914',
 'USERS.VIEW_DIRECTORY',
 'USERS',
 'VIEW_DIRECTORY',
 'Staff Directory (name/role lookup)',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('5013d80c-5d22-4d2b-8233-13d6613d27f7',
 'USERS.CREATE',
 'USERS',
 'CREATE',
 'Create User Account',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('892954be-b8a5-4f9f-8e42-c3f94b0b3585',
 'USERS.EDIT_STATUS',
 'USERS',
 'EDIT_STATUS',
 'Activate/Deactivate User',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('1fec5266-d8c8-429d-bec8-7c53c3ce5b2d',
 'USERS.FORCE_LOGOUT',
 'USERS',
 'FORCE_LOGOUT',
 'Force Logout (all devices)',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('d438fd9d-7309-4a33-ad32-946f0544f41d',
 'USERS.MANAGE_PERMISSIONS',
 'USERS',
 'MANAGE_PERMISSIONS',
 'Manage Roles & Permissions',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('8f857ae0-803b-4d6e-a77c-5df8ec2802a7',
 'SETTINGS.VIEW',
 'SETTINGS',
 'VIEW',
 'View Dropdown Values',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('0be5f297-d061-4d10-8d93-e80e641d1842',
 'SETTINGS.MANAGE',
 'SETTINGS',
 'MANAGE',
 'Manage Dropdown Values',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('49672747-ede3-4993-a739-50c8fa75cd38',
 'AUDIT_LOG.VIEW_ALL',
 'AUDIT_LOG',
 'VIEW_ALL',
 'View Full Audit Log',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('fe00594c-5857-49ee-8857-eba3b2d4fafd',
 'AUDIT_LOG.VIEW_OWN',
 'AUDIT_LOG',
 'VIEW_OWN',
 'View Own Action History',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('83310c0b-abbe-467a-a253-c002d65834c0',
 'REPORTS.VIEW',
 'REPORTS',
 'VIEW',
 'View Reports',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('d4e4ede1-caac-4e6f-afd4-c71f306271fd',
 'REPORTS.EXPORT',
 'REPORTS',
 'EXPORT',
 'Export Reports',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('a556c20f-c1a5-42bc-9391-454649e21b05',
 'CONTACTS.VIEW',
 'CONTACTS',
 'VIEW',
 'View Contact Directory',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('2ad58e18-ef85-4c78-a4b8-339bf6b00e9f',
 'CONTACTS.CREATE',
 'CONTACTS',
 'CREATE',
 'Create Contact',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('53c263e8-2891-4f09-9379-1cebefc9f911',
 'CONTACTS.EDIT',
 'CONTACTS',
 'EDIT',
 'Edit Contact',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('d6f8251b-9327-4200-986b-0a4f4a833ffc',
 'CONTACTS.DELETE',
 'CONTACTS',
 'DELETE',
 'Delete Contact (soft)',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('388fae21-fd00-4b55-99a3-a3a40abd015e',
 'CONTACTS.RESTORE',
 'CONTACTS',
 'RESTORE',
 'Restore Contact',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('b5e8f172-ba43-433a-9913-605e22978e0d',
 'CONTACTS.PERMANENT_DELETE',
 'CONTACTS',
 'PERMANENT_DELETE',
 'Permanently Delete Contact',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('e621116a-227f-4465-b3a6-3cc641fddfd7',
 'TIMELOGS.VIEW',
 'TIMELOGS',
 'VIEW',
 'View Time Logs',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('91085511-fca1-44d2-abf8-d29c0c82422a',
 'TIMELOGS.CREATE',
 'TIMELOGS',
 'CREATE',
 'Log Billable Hours',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('3f197de0-7d09-45bc-9a2e-dd62600fcf6f',
 'TIMELOGS.EDIT',
 'TIMELOGS',
 'EDIT',
 'Edit Time Log',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('3309cf7b-4ce2-48ff-b068-8e6ccef97cdc',
 'TIMELOGS.DELETE',
 'TIMELOGS',
 'DELETE',
 'Delete Time Log',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('79a9f3db-da83-4e8d-b68e-a05c928c96ca',
 'EXPENSES.VIEW',
 'EXPENSES',
 'VIEW',
 'View Expenses',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('588d5f04-125d-474b-9cc1-4c306a11c98f',
 'EXPENSES.CREATE',
 'EXPENSES',
 'CREATE',
 'Log Expense',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('09a2aaad-3cbc-498a-96a0-8df5fd22e83a',
 'EXPENSES.EDIT',
 'EXPENSES',
 'EDIT',
 'Edit Expense',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('c99cb6c3-3902-47f9-8790-345f11c0c448',
 'EXPENSES.DELETE',
 'EXPENSES',
 'DELETE',
 'Delete Expense (soft)',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('1fcde22d-2dd4-4ffa-a10f-d1ab37f40286',
 'EXPENSES.RESTORE',
 'EXPENSES',
 'RESTORE',
 'Restore Expense',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('00b1683d-00b6-4d4b-bd29-f7d993eb37f5',
 'EXPENSES.PERMANENT_DELETE',
 'EXPENSES',
 'PERMANENT_DELETE',
 'Permanently Delete Expense',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('b3e37473-bd51-495c-b3d0-3ca2be7ccba4',
 'BILLING.VIEW',
 'BILLING',
 'VIEW',
 'View Invoices',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('27a72a37-cec7-406a-a817-c1d6371bcdb7',
 'BILLING.CREATE_DRAFT',
 'BILLING',
 'CREATE_DRAFT',
 'Draft Invoice',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('3d2eb8aa-a6e4-487f-b826-8b0489f2d03e',
 'BILLING.APPROVE',
 'BILLING',
 'APPROVE',
 'Approve/Send Invoice',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('83af0fec-5feb-46d1-b584-c05b3c79d335',
 'BILLING.RECORD_PAYMENT',
 'BILLING',
 'RECORD_PAYMENT',
 'Record Payment',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('e7982adb-6e93-424d-9c88-01763db0a640',
 'DATA_IMPORT.RUN',
 'DATA_IMPORT',
 'RUN',
 'Bulk Import Clients/Matters/Contacts',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('c1000b9d-75b0-4ebb-b6f0-a43b54ed9769',
 'FIRM_PROFILE.VIEW',
 'FIRM_PROFILE',
 'VIEW',
 'View Firm Profile',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('8783234e-7b76-48ce-851a-ccead1fa2478',
 'FIRM_PROFILE.MANAGE',
 'FIRM_PROFILE',
 'MANAGE',
 'Edit Firm Profile',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('1df84787-b32f-4304-9be0-33ff10f0d7ff',
 'ANNOUNCEMENTS.VIEW',
 'ANNOUNCEMENTS',
 'VIEW',
 'View Office Announcements',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('63e4b51c-7214-4744-8e87-d38e448833a0',
 'ANNOUNCEMENTS.CREATE',
 'ANNOUNCEMENTS',
 'CREATE',
 'Post Office Announcement',
 NULL,
 false,
 false,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('52bed88d-b777-4ad3-a675-867953750b38',
 'CUSTOM_FIELDS.MANAGE',
 'CUSTOM_FIELDS',
 'MANAGE',
 'Manage Custom Fields',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('bb259cfc-17ef-441d-8ced-4af0913b55dd',
 'SESSIONS.VIEW_ANY',
 'SESSIONS',
 'VIEW_ANY',
 'View Any User''s Sessions',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('57db334a-0e25-4a34-9a9a-e5b63757818a',
 'ACCOUNTS.VIEW',
 'ACCOUNTS',
 'VIEW',
 'View Accounts',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('a3575995-9000-4b1a-9982-105d97957e82',
 'ACCOUNTS.CREATE_PAYMENT',
 'ACCOUNTS',
 'CREATE_PAYMENT',
 'Record Payment',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('124ec959-a1bf-4231-ab6f-42b44cbefc47',
 'ACCOUNTS.EDIT_PAYMENT',
 'ACCOUNTS',
 'EDIT_PAYMENT',
 'Edit Payment',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('6c108fe8-8bb9-42e2-bca7-fb28b7a2617a',
 'ACCOUNTS.DELETE_PAYMENT',
 'ACCOUNTS',
 'DELETE_PAYMENT',
 'Delete Payment',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('efe08866-4d00-4504-8da8-b11c4e937536',
 'ACCOUNTS.VIEW_EXPENSES',
 'ACCOUNTS',
 'VIEW_EXPENSES',
 'View Expenses (Accounts)',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('c9e5b815-1f74-44b7-8e37-fd1374f83d95',
 'ACCOUNTS.CREATE_EXPENSE',
 'ACCOUNTS',
 'CREATE_EXPENSE',
 'Log Expense (Accounts)',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('10356910-7926-4fbb-86b4-f3e89e08bcba',
 'ACCOUNTS.EDIT_EXPENSE',
 'ACCOUNTS',
 'EDIT_EXPENSE',
 'Edit Expense (Accounts)',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('a3a68fbc-7927-4922-9631-3916fe8f194c',
 'ACCOUNTS.DELETE_EXPENSE',
 'ACCOUNTS',
 'DELETE_EXPENSE',
 'Delete Expense (Accounts)',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('dda50801-cb00-40ea-af2b-1871d5ce6345',
 'ACCOUNTS.VIEW_INVOICE',
 'ACCOUNTS',
 'VIEW_INVOICE',
 'View Invoices (Accounts)',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('e3787bd8-7c52-4cc2-9a89-499ac8159197',
 'ACCOUNTS.CREATE_INVOICE',
 'ACCOUNTS',
 'CREATE_INVOICE',
 'Create Invoice (Accounts)',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('4e1f8976-ced7-46d6-a338-d5a3b419881e',
 'ACCOUNTS.EDIT_INVOICE',
 'ACCOUNTS',
 'EDIT_INVOICE',
 'Edit Invoice (Accounts)',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('9061a5f1-faad-42ba-9de4-95de2f211bb3',
 'ACCOUNTS.DELETE_INVOICE',
 'ACCOUNTS',
 'DELETE_INVOICE',
 'Delete Invoice (Accounts)',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('bb1ceb62-8a91-44bb-a99b-f09b91d1c27b',
 'ACCOUNTS.VIEW_REPORTS',
 'ACCOUNTS',
 'VIEW_REPORTS',
 'View Accounts Reports',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('a0888358-08f9-4701-b251-6df852629db2',
 'ACCOUNTS.MANAGE_FEE',
 'ACCOUNTS',
 'MANAGE_FEE',
 'Manage Professional Fees',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('c1f4f5df-08a3-4018-b195-5fbdfaf61a6b',
 'CASE_OVERVIEW.VIEW',
 'CASE_OVERVIEW',
 'VIEW',
 'View Case Overview',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('ca8d35db-4980-4525-b157-a4923b3ffc39',
 'CASE_DOCUMENTS.VIEW',
 'CASE_DOCUMENTS',
 'VIEW',
 'View Case Documents Tab',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('3dd6590a-e172-4a65-8a07-138f053deee7',
 'CASE_TASKS.VIEW',
 'CASE_TASKS',
 'VIEW',
 'View Case Tasks Tab',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('32deff9b-6477-4e06-8a68-a7fcf63078be',
 'CASE_HEARINGS.VIEW',
 'CASE_HEARINGS',
 'VIEW',
 'View Case Hearings Tab',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('681409bf-cb6e-4ae0-99a5-acf948b6d7eb',
 'CASE_TIMELINE.VIEW',
 'CASE_TIMELINE',
 'VIEW',
 'View Case Hearing Timeline',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('5425c9a9-50a2-488e-8607-5d97519e8d79',
 'CASE_FACTS.VIEW',
 'CASE_FACTS',
 'VIEW',
 'View Case Facts Tab',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('254f811c-6974-4b55-a05f-1b87fcc4a6ad',
 'CASE_ARGUMENTS.VIEW',
 'CASE_ARGUMENTS',
 'VIEW',
 'View Case Arguments Tab',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('f041abe3-6e27-4ab9-9914-51be70113427',
 'CASE_BILLING_EXPENSES.VIEW',
 'CASE_BILLING_EXPENSES',
 'VIEW',
 'View Case Billing / Expenses Tab',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission"
("id","key","module","action","label","description","isViewScope","isCoreAdmin","createdAt")
VALUES
('147c2945-ea40-44d2-ab48-586e4dfb09d3',
 'CASE_ACCOUNTS.VIEW',
 'CASE_ACCOUNTS',
 'VIEW',
 'View Case Accounts Tab',
 NULL,
 false,
 true,
 NOW())
ON CONFLICT ("key") DO NOTHING;

