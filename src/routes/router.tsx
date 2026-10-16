import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from '@/layouts/AppLayout';
import LoginPage from '@/pages/LoginPage';
import { RequireAuth, RequireRole } from './guards';

const page = <T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await loader())[name] as React.ComponentType }));

const DashboardPage = page(() => import('@/pages/DashboardPage'), 'DashboardPage');
const DocumentsPage = page(() => import('@/pages/DocumentsPage'), 'DocumentsPage');
const DocumentDetailPage = page(() => import('@/pages/DocumentDetailPage'), 'DocumentDetailPage');
const ReportsPage = page(() => import('@/pages/ReportsPage'), 'ReportsPage');
const ReportPage = page(() => import('@/pages/ReportPage'), 'ReportPage');
const AuditPage = page(() => import('@/pages/AuditPage'), 'AuditPage');
const ProfilePage = page(() => import('@/pages/ProfilePage'), 'ProfilePage');
const NotificationsPage = page(() => import('@/pages/NotificationsPage'), 'NotificationsPage');
const NotFoundPage = page(() => import('@/pages/NotFoundPage'), 'NotFoundPage');

const UploadPage = page(() => import('@/pages/engineer/UploadPage'), 'UploadPage');
const ChatbotPage = page(() => import('@/pages/engineer/ChatbotPage'), 'ChatbotPage');
const ManualTestingListPage = page(() => import('@/pages/engineer/ManualTestingListPage'), 'ManualTestingListPage');
const ManualTestingPage = page(() => import('@/pages/engineer/ManualTestingPage'), 'ManualTestingPage');
const TrackingPage = page(() => import('@/pages/engineer/TrackingPage'), 'TrackingPage');

const ApprovalQueuePage = page(() => import('@/pages/manager/ApprovalQueuePage'), 'ApprovalQueuePage');
const ReviewPage = page(() => import('@/pages/manager/ReviewPage'), 'ReviewPage');
const ProjectsPage = page(() => import('@/pages/manager/ProjectsPage'), 'ProjectsPage');
const ApprovedPage = page(() => import('@/pages/manager/ApprovedPage'), 'ApprovedPage');
const VendorListPage = page(() => import('@/pages/manager/VendorListPage'), 'VendorListPage');
const VendorHandoverPage = page(() => import('@/pages/manager/VendorHandoverPage'), 'VendorHandoverPage');
const AnalyticsPage = page(() => import('@/pages/manager/AnalyticsPage'), 'AnalyticsPage');

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'documents', element: <DocumentsPage /> },
          { path: 'documents/:id', element: <DocumentDetailPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'reports/:reportId', element: <ReportPage /> },
          { path: 'audit', element: <AuditPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          {
            element: <RequireRole role="engineer" />,
            children: [
              { path: 'upload', element: <UploadPage /> },
              { path: 'validate', element: <ChatbotPage /> },
              { path: 'validate/:id', element: <ChatbotPage /> },
              { path: 'manual-testing', element: <ManualTestingListPage /> },
              { path: 'manual-testing/:id', element: <ManualTestingPage /> },
              { path: 'tracking', element: <TrackingPage /> },
            ],
          },
          {
            element: <RequireRole role="manager" />,
            children: [
              { path: 'approvals', element: <ApprovalQueuePage /> },
              { path: 'review/:id', element: <ReviewPage /> },
              { path: 'projects', element: <ProjectsPage /> },
              { path: 'approved', element: <ApprovedPage /> },
              { path: 'vendor', element: <VendorListPage /> },
              { path: 'vendor/:id', element: <VendorHandoverPage /> },
              { path: 'analytics', element: <AnalyticsPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
