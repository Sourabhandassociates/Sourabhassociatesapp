import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ClientPortalDashboard from "./pages/ClientPortal/ClientPortalDashboard";
import ClientPortalCases from "./pages/ClientPortal/ClientPortalCases";
import ClientPortalCaseDetail from "./pages/ClientPortal/ClientPortalCaseDetail";
import ClientList from "./pages/Clients/ClientList";
import NewClient from "./pages/Clients/NewClient";
import ClientDetail from "./pages/Clients/ClientDetail";
import ContactList from "./pages/Contacts/ContactList";
import NewContact from "./pages/Contacts/NewContact";
import ContactDetail from "./pages/Contacts/ContactDetail";
import Accounts from "./pages/Accounts/Accounts";
import InvoiceList from "./pages/Invoices/InvoiceList";
import NewInvoice from "./pages/Invoices/NewInvoice";
import InvoiceDetail from "./pages/Invoices/InvoiceDetail";
import SearchResults from "./pages/Search/SearchResults";
import Reports from "./pages/Reports/Reports";
import DataImport from "./pages/DataImport/DataImport";
import Utilities from "./pages/Admin/Utilities";
import AnnouncementDetail from "./pages/Announcements/AnnouncementDetail";
import CaseList from "./pages/Cases/CaseList";
import NewCase from "./pages/Cases/NewCase";
import CaseDetail from "./pages/Cases/CaseDetail";
import MyTasks from "./pages/Tasks/MyTasks";
import TaskDetail from "./pages/Tasks/TaskDetail";
import HearingCalendar from "./pages/Calendar/HearingCalendar";
import CauseList from "./pages/CauseList/CauseList";
import UserList from "./pages/Users/UserList";
import NewUser from "./pages/Users/NewUser";
import DropdownSettings from "./pages/Admin/DropdownSettings";
import EmployeeTaskAudit from "./pages/Admin/EmployeeTaskAudit";
import RecycleBin from "./pages/Admin/RecycleBin";
import PermissionManagement from "./pages/Admin/PermissionManagement";
import FirmProfile from "./pages/Admin/FirmProfile";
import CustomFields from "./pages/Admin/CustomFields";
import AuditLogViewer from "./pages/Admin/AuditLogViewer";
import Sessions from "./pages/Account/Sessions";
import MfaSettings from "./pages/Account/MfaSettings";
import { Layout } from "./components/Layout";
import { ProtectedRoute, StaffOnlyRoute, ClientOnlyRoute } from "./components/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<ClientOnlyRoute />}>
          <Route path="/client-portal" element={<ClientPortalDashboard />} />
          <Route path="/client-portal/cases" element={<ClientPortalCases />} />
          <Route path="/client-portal/cases/:id" element={<ClientPortalCaseDetail />} />
        </Route>

        <Route element={<StaffOnlyRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/clients" element={<ClientList />} />
            <Route path="/clients/new" element={<NewClient />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
            <Route path="/contacts" element={<ContactList />} />
            <Route path="/contacts/new" element={<NewContact />} />
            <Route path="/contacts/:id" element={<ContactDetail />} />
            <Route path="/account" element={<Accounts />} />
            <Route path="/invoices" element={<InvoiceList />} />
            <Route path="/invoices/new" element={<NewInvoice />} />
            <Route path="/invoices/:id" element={<InvoiceDetail />} />
            <Route path="/search" element={<SearchResults />} />
            <Route path="/reports" element={<Reports />} />
            {/* Admin Settings -> Utilities reorganization (2026-08-12) — Data Import moved
                under /admin/utilities; the old /data-import URL redirects so existing
                bookmarks/deep links keep working. */}
            <Route path="/data-import" element={<Navigate to="/admin/utilities/data-import" replace />} />
            <Route path="/admin/utilities" element={<Utilities />} />
            <Route path="/admin/utilities/data-import" element={<DataImport />} />
            <Route path="/announcements/:id" element={<AnnouncementDetail />} />
            <Route path="/cases" element={<CaseList />} />
            <Route path="/cases/new" element={<NewCase />} />
            <Route path="/cases/:id" element={<CaseDetail />} />
            <Route path="/tasks" element={<MyTasks />} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/calendar" element={<HearingCalendar />} />
            <Route path="/cause-list" element={<CauseList />} />
            <Route path="/users" element={<UserList />} />
            <Route path="/users/new" element={<NewUser />} />
            <Route path="/admin/dropdowns" element={<DropdownSettings />} />
            <Route path="/admin/employee-audit" element={<EmployeeTaskAudit />} />
            <Route path="/admin/recycle-bin" element={<RecycleBin />} />
            <Route path="/admin/permissions" element={<PermissionManagement />} />
            <Route path="/firm-profile" element={<FirmProfile />} />
            <Route path="/admin/custom-fields" element={<CustomFields />} />
            <Route path="/admin/audit-log" element={<AuditLogViewer />} />
            <Route path="/account/sessions" element={<Sessions />} />
            <Route path="/account/mfa" element={<MfaSettings />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
