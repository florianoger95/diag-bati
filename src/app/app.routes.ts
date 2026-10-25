import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/projects/home.page').then((m) => m.HomePage), title: 'Dossiers — Diag bâti' },
  { path: 'reglages', loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage), title: 'Réglages' },
  { path: 'dossiers/nouveau', loadComponent: () => import('./features/projects/new-project.page').then((m) => m.NewProjectPage), title: 'Nouveau dossier' },
  { path: 'dossiers/:projectId', loadComponent: () => import('./features/projects/project.page').then((m) => m.ProjectPage), title: 'Dossier' },
  {
    path: 'dossiers/:projectId/v/:visitId',
    loadComponent: () => import('./features/visit/visit.page').then((m) => m.VisitPage),
    title: 'Visite',
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/visit/visit-resume.page').then((m) => m.VisitResumePage) },
      { path: 'conditions', loadComponent: () => import('./features/visit/conditions.page').then((m) => m.ConditionsPage) },
      { path: 'i/:instanceId', loadComponent: () => import('./features/visit/instance.page').then((m) => m.InstancePage) },
      { path: 'synthese', loadComponent: () => import('./features/visit/synthese.page').then((m) => m.SynthesePage) },
      { path: 'rapport', loadComponent: () => import('./features/report/report.page').then((m) => m.ReportPage) },
      { path: 'conclusion', loadComponent: () => import('./features/visit/conclusion.page').then((m) => m.ConclusionPage) },
      { path: 'plans', loadComponent: () => import('./features/visit/media/plans.page').then((m) => m.PlansPage) },
      { path: 'photos', loadComponent: () => import('./features/visit/media/photos.page').then((m) => m.PhotosPage) },
      { path: 'photos/:photoId', loadComponent: () => import('./features/visit/annotator/annotator.page').then((m) => m.AnnotatorPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
