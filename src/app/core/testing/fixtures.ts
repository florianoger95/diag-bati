import { ChecklistTemplate } from '../model/template';

/** Petit modèle couvrant tous les cas du moteur, utilisé par les tests. */
export function sampleTemplate(): ChecklistTemplate {
  return {
    templateId: 'test-diag',
    version: '1.0.0',
    label: 'Diagnostic de test',
    optionSets: {
      etat: [
        { value: 'bon', label: 'Bon' },
        { value: 'moyen', label: 'Moyen' },
        { value: 'mauvais', label: 'Mauvais', warn: true },
      ],
    },
    projectFields: [
      { id: 'projet', label: 'Projet', type: 'text', required: true, observation: false },
      { id: 'adresse', label: 'Adresse', type: 'text', required: true, observation: false },
    ],
    visitFields: [
      { id: 'date-visite', label: 'Date et heure de visite', type: 'datetime', required: true, observation: false },
      { id: 'temperature', label: 'Température extérieure', type: 'number', unit: '°C', required: false, observation: false },
    ],
    sectionFooter: [
      { id: 'commentaires', label: 'Commentaires', type: 'text', role: 'comment', required: false, observation: false },
      { id: 'preconisations', label: 'Préconisations', type: 'actions', role: 'recommendation', required: false, observation: false },
      { id: 'securite', label: 'Mesures de sécurité à court terme', type: 'actions', role: 'safety', required: false, observation: false },
    ],
    sections: [
      {
        id: 'generalites',
        label: 'Généralités',
        footer: false,
        items: [
          { id: 'gen-temps', label: 'Temps', type: 'text', required: true },
          { id: 'gen-plan', label: 'Plan de masse', type: 'photo', photoKind: 'plan', required: false },
        ],
      },
      {
        id: 'couverture',
        label: 'Diagnostic couverture',
        repeatable: { noun: 'Bâtiment', suggestions: ['Bâtiment A', 'Bâtiment B'] },
        items: [
          { id: 'couv-titre', label: 'Tuiles', type: 'heading', required: false },
          { id: 'couv-type', label: 'Types de couverture', type: 'enum', required: true, allowOther: true,
            options: [{ value: '1-pan', label: '1 pan' }, { value: '2-pans', label: '2 pans' }] },
          { id: 'couv-etat', label: 'État des tuiles', type: 'enum', options: 'etat', required: true },
          { id: 'couv-patho', label: 'Pathologies', type: 'multi', required: false,
            options: [{ value: 'mousse', label: 'Mousse' }, { value: 'cassees', label: 'Cassées' }] },
          { id: 'couv-gouttiere', label: 'Présence de gouttière', type: 'boolean', required: false },
        ],
      },
      {
        id: 'facades',
        label: 'Diagnostic façades',
        repeatable: { noun: 'Façade', suggestions: ['Nord', 'Sud'], min: 1 },
        items: [
          { id: 'fac-pente', label: "Pente de l'appui", type: 'number', unit: '%', min: 8, required: false },
          { id: 'fac-humidite', label: 'Humidité du mur', type: 'measures', required: false,
            measures: { points: ['0 m', '1 m', '2 m'], columns: [{ label: 'Humidité', unit: '%' }] } },
          { id: 'fac-date', label: 'Date du relevé', type: 'date', required: false },
        ],
      },
    ],
  };
}
