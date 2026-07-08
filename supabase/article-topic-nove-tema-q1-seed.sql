-- Article Factory: import tématu z nove_tema_q1_clanek.csv
-- Spusťte v Supabase SQL Editoru po importu publikací.

insert into public.kb_article_topics (
  source_key, title, description, research_area, possible_methodology,
  target_wos_category, expected_contribution, priority, status, notes
) values (
  'hybrid ai-driven decision support framework for process risk assessment and reengineering in research-intensive organizations|decision support systems; business process management; operational research; institutional research governance; ai-assisted risk assessment',
  'Hybrid AI-Driven Decision Support Framework for Process Risk Assessment and Reengineering in Research-Intensive Organizations',
  'The article will propose and validate a hybrid decision-support framework that uses AI-assisted document analysis, process modelling and risk scoring to identify weak points in institutional research, transfer and security-related processes and to design optimized To-Be workflows.',
  'Decision support systems; business process management; operational research; institutional research governance; AI-assisted risk assessment',
  'Design science research; BPMN/ArchiMate As-Is and To-Be process modelling; document and process analysis; hybrid fuzzy MCDM risk scoring; expert validation; university case study; sensitivity and robustness analysis',
  'Computer Science, Artificial Intelligence; Operations Research & Management Science; Management; Information Science & Library Science',
  'A validated framework for transforming fragmented institutional procedures into transparent, risk-aware and optimizable decision processes, with methodological contribution in AI-assisted BPM/MCDM integration and practical contribution for research governance.',
  5,
  'idea',
  'Potential Q1 target journal: Expert Systems with Applications. Empirical contribution should be strengthened by a real institutional case study, expert validation and comparison with a non-AI baseline.'
)
on conflict (source_key) do update set
  title = excluded.title,
  description = excluded.description,
  research_area = excluded.research_area,
  possible_methodology = excluded.possible_methodology,
  target_wos_category = excluded.target_wos_category,
  expected_contribution = excluded.expected_contribution,
  priority = excluded.priority,
  status = excluded.status,
  notes = excluded.notes,
  updated_at = now();

-- Propojení souvisejících publikací podle názvu
insert into public.kb_article_topic_publications (topic_id, publication_id)
select t.id, p.id
from public.kb_article_topics t
join public.kb_article_publications p on true
where t.source_key = 'hybrid ai-driven decision support framework for process risk assessment and reengineering in research-intensive organizations|decision support systems; business process management; operational research; institutional research governance; ai-assisted risk assessment'
and (
  lower(trim(p.title)) = lower(trim('Optimization of Production Processes using BPMN and ArchiMate'))
   or   lower(trim(p.title)) = lower(trim('Computer aided detection of breathing disorder from ballistocardiography signal using convolutional neural network'))
   or   lower(trim(p.title)) = lower(trim('An Agent-Based Simulation to Minimize Losses during a Terrorist Attack'))
   or   lower(trim(p.title)) = lower(trim('Approaches combining methods of Operational Research with Business Process Model and Notation: A systematic review'))
   or   lower(trim(p.title)) = lower(trim('Evaluation of Wind Turbine Failure Modes Using the Developed SWARA-CoCoSo Methods Based on the Spherical Fuzzy Environment'))
   or   lower(trim(p.title)) = lower(trim('An integrated multi-criteria decision-making approach to optimize the number of leagile-sustainable suppliers in supply chains'))
   or   lower(trim(p.title)) = lower(trim('Business process optimization for trauma planning'))
   or   lower(trim(p.title)) = lower(trim('Sustainable resilient supplier selection for IoT implementation based on the integrated BWM and TRUST under spherical fuzzy sets'))
   or   lower(trim(p.title)) = lower(trim('A dynamic expert system to increase patient satisfaction with an integrated approach of system dynamics, ISM, and ANP methods'))
   or   lower(trim(p.title)) = lower(trim('Exploring decision-making techniques for evaluation and benchmarking of energy system integration frameworks for achieving a sustainable energy future'))
   or   lower(trim(p.title)) = lower(trim('Ranking Factors Affecting Sustainable Competitive Advantage From the Business Intelligence Perspective: Using Content Analysis and F-TOPSIS'))
   or   lower(trim(p.title)) = lower(trim('Economic production quantity model with shortages under price- and green-sensitive demand in uncertain environment'))
   or   lower(trim(p.title)) = lower(trim('Security modules of delegation methods in mobile cloud computing using probabilistic interval neutrosophic hesitant fuzzy set based decision-making model'))
   or   lower(trim(p.title)) = lower(trim('A hybrid decision support system for transport policy selection: A case study on Russia’s Northern Sea route in Artic region'))
   or   lower(trim(p.title)) = lower(trim('Risk Management and Process Optimization in Industry 4.0: Integrating Sensors with Critical Path and FMEA'))
   or   lower(trim(p.title)) = lower(trim('Cloud supply chain as a service: overcoming barriers in the fashion retail industry by developing a new cognitive map model'))
   or   lower(trim(p.title)) = lower(trim('Comparative Analysis of AI-Integrated and Traditional Inventory Models under Uncertainty'))
)
on conflict (topic_id, publication_id) do nothing;

-- Ověření:
select t.title, t.priority, t.status, count(l.publication_id) as linked_pubs
from public.kb_article_topics t
left join public.kb_article_topic_publications l on l.topic_id = t.id
where t.source_key = 'hybrid ai-driven decision support framework for process risk assessment and reengineering in research-intensive organizations|decision support systems; business process management; operational research; institutional research governance; ai-assisted risk assessment'
group by t.id, t.title, t.priority, t.status;