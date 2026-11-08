-- LAB-CF-05: catalog of predefined experiment templates, one per common kind of study. They are public
-- (is_template) and read-only: no project and no owner, so that no one can change them through the API,
-- and no models, which each researcher picks in their own project. Solver settings name no version: the
-- interface takes the versions of the Reasoning catalog in use when the template is applied. The metrics
-- are predefined ones the Laboratory computes.

INSERT INTO __SCHEMA__.experiment (id, name, description, hypothesis, labels, status, is_template, is_benchmark, project_id)
VALUES
  ('7e3a1000-0000-4000-8000-000000000001', 'Solver benchmarking',
   'Runs the same input models with several solvers, to compare their answers and their reasoning times. Pick the input models of the scenario, then the solver versions.',
   'The solvers find the same configurations; their reasoning times differ.',
   '["predefined", "solvers"]', 'draft', TRUE, FALSE, NULL),
  ('7e3a1000-0000-4000-8000-000000000002', 'Configurability analysis',
   'Measures how configurable a product line is: how many products it allows, how much of the feature space they use and which features every product needs.',
   'The product line allows many products, and few features are required in all of them.',
   '["predefined", "configurability"]', 'draft', TRUE, FALSE, NULL),
  ('7e3a1000-0000-4000-8000-000000000003', 'Variability metrics of a model',
   'Measures the structure of a variability model: degree of variability, orphan elements, structural complexity and hierarchy depth.',
   'The model has no orphan elements and a moderate structural complexity.',
   '["predefined", "metrics"]', 'draft', TRUE, FALSE, NULL),
  ('7e3a1000-0000-4000-8000-000000000004', 'Operational context comparison',
   'Compares the same models without and with an operational context. Name the features to activate or deactivate, and the extra constraints, in the second scenario.',
   'The operational context reduces the configuration space.',
   '["predefined", "operational-context"]', 'draft', TRUE, FALSE, NULL),
  ('7e3a1000-0000-4000-8000-000000000005', 'Reproducibility check',
   'Runs a configuration, then checks that it can be reproduced: download the reproducibility package of the run, reproduce it, run the reproduction and compare both runs side by side.',
   'Re-running the experiment from its reproducibility package gives the same results, timings apart.',
   '["predefined", "reproducibility"]', 'draft', TRUE, FALSE, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO __SCHEMA__.scenario (id, experiment_id, name, position, solver_configs, operational_context)
VALUES
  ('7e3a1000-0000-4000-8000-000000000101', '7e3a1000-0000-4000-8000-000000000001', 'All solvers', 0,
   '{"minizinc": {"mode": "enumeration", "timeOut": 60}, "swi-prolog": {"mode": "enumeration", "timeOut": 60}, "z3": {"mode": "enumeration", "timeOut": 60}}', NULL),
  ('7e3a1000-0000-4000-8000-000000000201', '7e3a1000-0000-4000-8000-000000000002', 'Whole product line', 0,
   '{"z3": {"mode": "enumeration", "timeOut": 120}}', NULL),
  ('7e3a1000-0000-4000-8000-000000000301', '7e3a1000-0000-4000-8000-000000000003', 'Model', 0,
   '{"z3": {"mode": "satisfiability", "timeOut": 60}}', NULL),
  ('7e3a1000-0000-4000-8000-000000000401', '7e3a1000-0000-4000-8000-000000000004', 'Without context', 0,
   '{"z3": {"mode": "enumeration", "timeOut": 60}}', NULL),
  ('7e3a1000-0000-4000-8000-000000000402', '7e3a1000-0000-4000-8000-000000000004', 'With context', 1,
   '{"z3": {"mode": "enumeration", "timeOut": 60}}', '{"activeFeatures": [], "inactiveFeatures": [], "extraConstraints": ""}'),
  ('7e3a1000-0000-4000-8000-000000000501', '7e3a1000-0000-4000-8000-000000000005', 'Reference run', 0,
   '{"minizinc": {"mode": "enumeration", "timeOut": 60}, "z3": {"mode": "enumeration", "timeOut": 60}}', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO __SCHEMA__.experiment_metric (experiment_id, metric_id)
VALUES
  ('7e3a1000-0000-4000-8000-000000000001', '6c1ab000-0000-4000-8000-000000000001'),
  ('7e3a1000-0000-4000-8000-000000000001', '6c1ab000-0000-4000-8000-000000000004'),
  ('7e3a1000-0000-4000-8000-000000000001', '6c1ab000-0000-4000-8000-000000000005'),
  ('7e3a1000-0000-4000-8000-000000000002', '6c1ab000-0000-4000-8000-000000000001'),
  ('7e3a1000-0000-4000-8000-000000000002', '6c1ab000-0000-4000-8000-000000000002'),
  ('7e3a1000-0000-4000-8000-000000000002', '6c1ab000-0000-4000-8000-000000000003'),
  ('7e3a1000-0000-4000-8000-000000000002', '6c1ab000-0000-4000-8000-000000000004'),
  ('7e3a1000-0000-4000-8000-000000000003', '6c1ab000-0000-4000-8000-000000000002'),
  ('7e3a1000-0000-4000-8000-000000000003', '6c1ab000-0000-4000-8000-000000000018'),
  ('7e3a1000-0000-4000-8000-000000000003', '6c1ab000-0000-4000-8000-000000000019'),
  ('7e3a1000-0000-4000-8000-000000000003', '6c1ab000-0000-4000-8000-000000000020'),
  ('7e3a1000-0000-4000-8000-000000000004', '6c1ab000-0000-4000-8000-000000000001'),
  ('7e3a1000-0000-4000-8000-000000000004', '6c1ab000-0000-4000-8000-000000000004'),
  ('7e3a1000-0000-4000-8000-000000000004', '6c1ab000-0000-4000-8000-000000000005'),
  ('7e3a1000-0000-4000-8000-000000000005', '6c1ab000-0000-4000-8000-000000000001'),
  ('7e3a1000-0000-4000-8000-000000000005', '6c1ab000-0000-4000-8000-000000000004'),
  ('7e3a1000-0000-4000-8000-000000000005', '6c1ab000-0000-4000-8000-000000000005')
ON CONFLICT DO NOTHING;

-- Version 1 of each template, as the API records the configuration of a new experiment
INSERT INTO __SCHEMA__.experiment_version (experiment_id, version, user_id, config)
SELECT e.id, 1, NULL, jsonb_build_object(
  'name', e.name,
  'description', e.description,
  'hypothesis', e.hypothesis,
  'projectId', NULL,
  'labels', e.labels,
  'metricIds', (SELECT jsonb_agg(m.metric_id::text ORDER BY m.metric_id::text)
                FROM __SCHEMA__.experiment_metric m WHERE m.experiment_id = e.id),
  'scenarios', (SELECT jsonb_agg(
                  jsonb_build_object('id', s.id, 'name', s.name, 'modelIds', '[]'::jsonb, 'solverConfigs', s.solver_configs)
                  || CASE WHEN s.operational_context IS NULL THEN '{}'::jsonb
                          ELSE jsonb_build_object('operationalContext', s.operational_context) END
                  ORDER BY s.position)
                FROM __SCHEMA__.scenario s WHERE s.experiment_id = e.id))
FROM __SCHEMA__.experiment e
WHERE e.id IN ('7e3a1000-0000-4000-8000-000000000001', '7e3a1000-0000-4000-8000-000000000002',
               '7e3a1000-0000-4000-8000-000000000003', '7e3a1000-0000-4000-8000-000000000004',
               '7e3a1000-0000-4000-8000-000000000005')
ON CONFLICT (experiment_id, version) DO NOTHING;
