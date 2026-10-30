-- LAB-MT-01: catalog of predefined metrics, public (user_id NULL) and read-only.
-- The 6 examples named by LAB-MT-01 carry proposed formulas (formula_origin
-- 'proposed'); REQ-01 to REQ-14 use the formulas of the specification.
-- Computing them comes with runs (P3).

ALTER TABLE __SCHEMA__.metric
  ADD COLUMN IF NOT EXISTS code           TEXT,
  ADD COLUMN IF NOT EXISTS category       TEXT,
  ADD COLUMN IF NOT EXISTS source         TEXT,
  ADD COLUMN IF NOT EXISTS formula_origin TEXT CHECK (formula_origin IN ('spec', 'proposed')),
  ADD COLUMN IF NOT EXISTS requires       TEXT;

INSERT INTO __SCHEMA__.metric
  (id, code, name, category, formula, unit, description, source, formula_origin, requires)
VALUES
  ('6c1ab000-0000-4000-8000-000000000001', NULL, 'Number of products', 'System families', '#P = |{valid products of the input models}|', 'products', 'Number of valid products of the input models, without the scenario''s operational context.', 'LAB-MT-01', 'proposed', 'Variability model (computed by the Reasoning module)'),
  ('6c1ab000-0000-4000-8000-000000000002', NULL, 'Degree of variability', 'System families', '#P / 2^|F|', 'ratio (0–1)', 'Share of all feature combinations that are valid products (variability factor).', 'LAB-MT-01', 'proposed', 'Variability model (computed by the Reasoning module)'),
  ('6c1ab000-0000-4000-8000-000000000003', NULL, 'Rate of required features', 'System families', '|features present in every product| / |F|', 'ratio (0–1)', 'Share of features that every valid product must include.', 'LAB-MT-01', 'proposed', 'Variability model (computed by the Reasoning module)'),
  ('6c1ab000-0000-4000-8000-000000000004', NULL, 'Cardinality of the configuration space', 'System families', '|{valid configurations under the operational context}|', 'configurations', 'Number of valid configurations once the scenario''s active/inactive features and constraints are applied.', 'LAB-MT-01', 'proposed', 'Variability model (computed by the Reasoning module)'),
  ('6c1ab000-0000-4000-8000-000000000005', NULL, 'Reasoning time', 'System families', 't_end − t_start reported by the Reasoning API', 'ms', 'Time the Reasoning module took to answer the scenario''s queries.', 'LAB-MT-01', 'proposed', 'Any model'),
  ('6c1ab000-0000-4000-8000-000000000006', NULL, 'Domain coverage rate', 'Systems', 'domain features covered by the application model / domain features', 'ratio (0–1)', 'How much of its domain model an application model covers.', 'LAB-MT-01', 'proposed', 'Application model linked to its domain model'),
  ('6c1ab000-0000-4000-8000-000000000007', 'REQ-01', 'Degree of coupling (C)', 'Architecture and Modularity', 'C = F_out / (F_in + F_out)', 'ratio (0–1)', 'Share of outgoing dependencies of the components.', 'REQ-01', 'spec', 'Architecture model with component dependencies'),
  ('6c1ab000-0000-4000-8000-000000000008', 'REQ-02', 'Cohesion index (LCOM)', 'Architecture and Modularity', 'LCOM = 1 − real connections / possible connections between internal elements', 'ratio (0–1)', 'Lack of cohesion between the internal elements of the blocks.', 'REQ-02', 'spec', 'Architecture model with internal connections'),
  ('6c1ab000-0000-4000-8000-000000000009', 'REQ-03', 'Interface encapsulation ratio', 'Architecture and Modularity', 'ports associated with standard interfaces / total ports in the block', 'ratio (0–1)', 'Share of ports that go through standard interfaces.', 'REQ-03', 'spec', 'Architecture model with ports and interfaces'),
  ('6c1ab000-0000-4000-8000-000000000010', 'REQ-04', 'Commonality index (CI)', 'Product Line and Variability', 'CI = shared components in all the variants / total components of the base model (150% model)', 'ratio (0–1)', 'Share of the 150% model shared by every variant.', 'REQ-04', 'spec', 'Product line (150%) model'),
  ('6c1ab000-0000-4000-8000-000000000011', 'REQ-05', 'Variability density', 'Product Line and Variability', 'variation points (decision nodes) / total number of system functions', 'ratio (0–1)', 'How many decision nodes there are per system function.', 'REQ-05', 'spec', 'Product line model with variation points'),
  ('6c1ab000-0000-4000-8000-000000000012', 'REQ-06', 'Active reuse index', 'Product Line and Variability', 'standard library modules used / total modules in the instance', 'ratio (0–1)', 'Share of modules taken from the standard library.', 'REQ-06', 'spec', 'Model linked to a standard library'),
  ('6c1ab000-0000-4000-8000-000000000013', 'REQ-07', 'Interface stability index (ISI)', 'Evolution and Stability', 'ISI = 1 − modified interfaces / total interfaces of the previous version', 'ratio (0–1)', 'How stable the interfaces stay from one model version to the next.', 'REQ-07', 'spec', 'Architecture model with a previous version'),
  ('6c1ab000-0000-4000-8000-000000000014', 'REQ-08', 'Change propagation factor', 'Evolution and Stability', 'elements affected by a change in requirement / total number of elements in the model', 'ratio (0–1)', 'How far a requirement change spreads in the model.', 'REQ-08', 'spec', 'Model with requirement links'),
  ('6c1ab000-0000-4000-8000-000000000015', 'REQ-09', 'Component obsolescence rate', 'Evolution and Stability', 'modules with COTS technology / end-of-life hardware / total modules', 'ratio (0–1)', 'Share of modules relying on COTS or end-of-life hardware.', 'REQ-09', 'spec', 'Model with module lifecycle information'),
  ('6c1ab000-0000-4000-8000-000000000016', 'REQ-10', 'Horizontal traceability density', 'Trust and Traceability', 'requirements with link to design components / total requirements', 'ratio (0–1)', 'Share of requirements traced to the design.', 'REQ-10', 'spec', 'Model with requirements linked to design components'),
  ('6c1ab000-0000-4000-8000-000000000017', 'REQ-11', 'Verification coverage', 'Trust and Traceability', 'design components linked to test cases / total design components', 'ratio (0–1)', 'Share of design components covered by test cases.', 'REQ-11', 'spec', 'Model with design components linked to test cases'),
  ('6c1ab000-0000-4000-8000-000000000018', 'REQ-12', 'Orphan item rate', 'Trust and Traceability', 'model elements without input or output relationships / total elements', 'ratio (0–1)', 'Share of elements connected to nothing.', 'REQ-12', 'spec', 'Any model'),
  ('6c1ab000-0000-4000-8000-000000000019', 'REQ-13', 'Structural complexity of the model', 'Complexity or Maintainability', 'E − N + 2 (E: edges, N: nodes)', 'count', 'Cyclomatic-style complexity of the model graph.', 'REQ-13', 'spec', 'Any model'),
  ('6c1ab000-0000-4000-8000-000000000020', 'REQ-14', 'Maximum hierarchy depth', 'Complexity or Maintainability', 'maximum number of levels of structure decomposition (PBS/WBS)', 'levels', 'Depth of the deepest decomposition branch.', 'REQ-14', 'spec', 'Any model')
ON CONFLICT (id) DO NOTHING;
