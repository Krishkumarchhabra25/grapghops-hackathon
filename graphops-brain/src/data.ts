export const currentUser = { id:'u1', name:'Krish Chhabra', email:'krish@graphops.dev', role:'Workspace owner', initials:'KC', avatar:'#b9f56a' }

export const servicesSeed = [
  {id:'svc-checkout',name:'checkout-api',team:'Payments',env:'Production',status:'Degraded',health:74,latency:428,errorRate:3.8,deploy:'v2.18.4',owner:'Ananya Rao',updated:'4 min ago',description:'Handles cart validation, checkout sessions, and order creation.',repo:'acme/checkout-api',dependencies:['payment-gateway','orders-db','auth-service']},
  {id:'svc-payments',name:'payment-gateway',team:'Payments',env:'Production',status:'Healthy',health:99,latency:112,errorRate:0.08,deploy:'v3.1.2',owner:'Samar Patel',updated:'12 min ago',description:'Payment provider orchestration and transaction processing.',repo:'acme/payment-gateway',dependencies:['stripe-adapter','ledger-db']},
  {id:'svc-auth',name:'auth-service',team:'Platform',env:'Production',status:'Healthy',health:98,latency:68,errorRate:0.12,deploy:'v1.12.0',owner:'Meera Joshi',updated:'18 min ago',description:'Identity, session, and access token management.',repo:'acme/auth-service',dependencies:['identity-db','redis-session']},
  {id:'svc-orders',name:'orders-worker',team:'Commerce',env:'Production',status:'Healthy',health:96,latency:204,errorRate:0.21,deploy:'v4.0.1',owner:'Arjun Das',updated:'22 min ago',description:'Asynchronous order fulfillment and status transitions.',repo:'acme/orders-worker',dependencies:['orders-db','event-bus']},
  {id:'svc-search',name:'search-indexer',team:'Discovery',env:'Production',status:'Healthy',health:100,latency:91,errorRate:0.01,deploy:'v2.6.0',owner:'Rhea Nair',updated:'31 min ago',description:'Product indexing and full-text discovery.',repo:'acme/search-indexer',dependencies:['catalog-db','opensearch']},
  {id:'svc-notify',name:'notification-hub',team:'Platform',env:'Production',status:'Warning',health:87,latency:316,errorRate:1.1,deploy:'v1.7.3',owner:'Meera Joshi',updated:'44 min ago',description:'Email, SMS, and webhook notification delivery.',repo:'acme/notification-hub',dependencies:['event-bus','sendgrid']},
  {id:'svc-catalog',name:'catalog-api',team:'Discovery',env:'Production',status:'Healthy',health:99,latency:83,errorRate:0.03,deploy:'v5.3.1',owner:'Rhea Nair',updated:'1 hr ago',description:'Product metadata, pricing, and catalog API.',repo:'acme/catalog-api',dependencies:['catalog-db','redis-cache']},
]

export const incidentsSeed = [
  {id:'INC-2481',title:'Checkout error rate increased after deploy',service:'checkout-api',severity:'Critical',status:'Investigating',created:'4 min ago',time:'2026-10-15T02:41:00+05:30',assignee:'Krish Chhabra',summary:'Elevated 5xx responses started 3 minutes after v2.18.4 reached production. Payment authorization requests are timing out.',impact:'18.4% of checkout attempts affected',rootCause:'Suspected payment SDK timeout regression',source:'Datadog alert',related:['INC-2410','DEP-982','DOC-17'],confidence:87,tags:['checkout','deployment','payments']},
  {id:'INC-2479',title:'Notification delivery latency above SLO',service:'notification-hub',severity:'High',status:'Monitoring',created:'26 min ago',time:'2026-10-15T02:19:00+05:30',assignee:'Meera Joshi',summary:'p95 notification dispatch latency is 3.2s against a 1s SLO. Queue depth is elevated but draining.',impact:'Email and webhook delivery delayed by 1–3 minutes',rootCause:'Consumer concurrency limit reached',source:'SLO monitor',related:['INC-2317','DOC-12'],confidence:93,tags:['notifications','queue','slo']},
  {id:'INC-2472',title:'Elevated auth refresh failures in EU region',service:'auth-service',severity:'Medium',status:'Resolved',created:'2 hr ago',time:'2026-10-15T00:45:00+05:30',assignee:'Meera Joshi',summary:'Token refresh failures peaked after cache cluster failover in eu-west-1.',impact:'2.1% of EU sessions required re-authentication',rootCause:'Stale Redis connection pool after failover',source:'PagerDuty',related:['INC-2194','DOC-08'],confidence:99,tags:['auth','redis','eu-west-1']},
  {id:'INC-2468',title:'Search index lag exceeded 10 minutes',service:'search-indexer',severity:'Low',status:'Resolved',created:'5 hr ago',time:'2026-10-14T21:52:00+05:30',assignee:'Rhea Nair',summary:'Indexer consumer fell behind after a large catalog backfill.',impact:'New products were not searchable for some users',rootCause:'Batch size too high for current worker memory limit',source:'Internal monitor',related:['DOC-22'],confidence:96,tags:['search','indexing']},
  {id:'INC-2464',title:'Order worker retry storm',service:'orders-worker',severity:'High',status:'Resolved',created:'8 hr ago',time:'2026-10-14T19:05:00+05:30',assignee:'Arjun Das',summary:'Retry volume grew 12x when a downstream inventory API returned intermittent 429s.',impact:'Order status updates delayed by up to 6 minutes',rootCause:'Missing jitter in exponential backoff',source:'Datadog alert',related:['INC-2011','DOC-15'],confidence:97,tags:['orders','retries','rate-limit']},
  {id:'INC-2452',title:'Payment reconciliation job skipped a partition',service:'payment-gateway',severity:'Medium',status:'Resolved',created:'1 day ago',time:'2026-10-14T02:04:00+05:30',assignee:'Samar Patel',summary:'A worker restart occurred between checkpoint writes, leaving partition 18 unprocessed.',impact:'Reconciliation delayed for 642 transactions',rootCause:'Checkpoint and offset writes were not atomic',source:'Audit monitor',related:['DOC-19'],confidence:98,tags:['payments','batch']},
]

export const investigationsSeed = [
  {id:'INV-093',title:'Checkout deployment regression',incident:'INC-2481',status:'Running',progress:72,agent:'Incident Investigator',started:'2 min ago',steps:8,findings:5,confidence:87,track:'Connected data'},
  {id:'INV-092',title:'Notification latency root cause',incident:'INC-2479',status:'Completed',progress:100,agent:'Incident Investigator',started:'24 min ago',steps:11,findings:7,confidence:93,track:'Connected data'},
  {id:'INV-091',title:'EU auth refresh failures',incident:'INC-2472',status:'Completed',progress:100,agent:'Platform SRE Agent',started:'2 hr ago',steps:9,findings:4,confidence:99,track:'Company brain'},
  {id:'INV-087',title:'Order retry pattern analysis',incident:'INC-2464',status:'Completed',progress:100,agent:'Memory Analyst',started:'8 hr ago',steps:7,findings:6,confidence:97,track:'Agent memory'},
]

export const runsSeed = [
  {id:'RUN-5832',name:'Checkout incident investigation',agent:'Incident Investigator',trigger:'Incident created',status:'Running',duration:'1m 42s',started:'2 min ago',tokens:'18.4k',cost:'$0.042',model:'Claude Sonnet 4',steps:8,success:null},
  {id:'RUN-5831',name:'Notification latency analysis',agent:'Incident Investigator',trigger:'Manual',status:'Success',duration:'48s',started:'24 min ago',tokens:'12.2k',cost:'$0.031',model:'Claude Sonnet 4',steps:11,success:true},
  {id:'RUN-5830',name:'EU auth memory retrieval',agent:'Memory Analyst',trigger:'Scheduled',status:'Success',duration:'21s',started:'2 hr ago',tokens:'5.8k',cost:'$0.014',model:'GPT-4.1 mini',steps:6,success:true},
  {id:'RUN-5829',name:'Dependency map refresh',agent:'Graph Researcher',trigger:'Scheduled',status:'Success',duration:'13s',started:'3 hr ago',tokens:'2.1k',cost:'$0.006',model:'GPT-4.1 mini',steps:4,success:true},
  {id:'RUN-5828',name:'Order retry pattern analysis',agent:'Memory Analyst',trigger:'Manual',status:'Failed',duration:'32s',started:'8 hr ago',tokens:'8.7k',cost:'$0.022',model:'Claude Sonnet 4',steps:5,success:false},
  {id:'RUN-5827',name:'Knowledge base sync',agent:'Company Brain',trigger:'Webhook',status:'Success',duration:'1m 08s',started:'9 hr ago',tokens:'14.2k',cost:'$0.037',model:'Claude Sonnet 4',steps:9,success:true},
]

export const memoriesSeed = [
  {id:'MEM-1204',title:'Payment SDK timeout regression',type:'Episodic',summary:'On 2026-10-09, checkout-api 2.17.9 began timing out when payment-sdk v3.2.0 changed its default retry policy.',confidence:0.94,source:'INC-2410',updated:'6 days ago',uses:12,entities:['checkout-api','payment-sdk','timeout','v3.2.0'],status:'Verified'},
  {id:'MEM-1198',title:'Safe payment SDK rollback path',type:'Procedural',summary:'Pin payment-sdk to v3.1.8, run checkout contract tests, then gradually shift 10% → 50% → 100% traffic.',confidence:0.98,source:'RUN-5791',updated:'6 days ago',uses:8,entities:['payment-sdk','rollback','contract tests'],status:'Verified'},
  {id:'MEM-1182',title:'Checkout service dependency map',type:'Semantic',summary:'checkout-api calls payment-gateway and auth-service. It writes orders via orders-db and emits order.created events.',confidence:0.99,source:'Graph sync',updated:'1 day ago',uses:43,entities:['checkout-api','payment-gateway','auth-service','orders-db'],status:'Verified'},
  {id:'MEM-1160',title:'Notification consumer saturation',type:'Episodic',summary:'notification-hub latency spikes when consumer concurrency falls below 8 while queue depth exceeds 4,000.',confidence:0.92,source:'INC-2317',updated:'2 weeks ago',uses:6,entities:['notification-hub','queue','concurrency'],status:'Verified'},
  {id:'MEM-1107',title:'Never auto-apply database migrations',type:'Policy',summary:'Database schema changes require a human approval and a rollback plan before execution in production.',confidence:1,source:'Engineering policy',updated:'3 weeks ago',uses:21,entities:['production','database','approval'],status:'Pinned'},
  {id:'MEM-1093',title:'Exponential backoff with jitter',type:'Procedural',summary:'For 429 and transient 5xx responses, use exponential backoff plus randomized jitter. Cap retries at 5 and emit a final failure event.',confidence:0.96,source:'INC-2011',updated:'1 month ago',uses:17,entities:['retry','429','backoff','jitter'],status:'Verified'},
]

export const docsSeed = [
  {id:'DOC-17',title:'Checkout service runbook',type:'Runbook',space:'Platform Engineering',owner:'Ananya Rao',updated:'Oct 14, 2026',status:'Synced',chunks:24,connected:18,summary:'Checkout triage steps, dependency ownership, error-rate alerts, safe rollback, and contract test commands.'},
  {id:'DOC-15',title:'Retry and rate-limit standards',type:'Engineering RFC',space:'Reliability',owner:'Arjun Das',updated:'Oct 12, 2026',status:'Synced',chunks:17,connected:12,summary:'Backoff strategy, jitter, retry budget, idempotency, and handling provider 429 responses.'},
  {id:'DOC-22',title:'Search indexing operations',type:'Runbook',space:'Discovery',owner:'Rhea Nair',updated:'Oct 11, 2026',status:'Synced',chunks:13,connected:9,summary:'Backfill operation, consumer lag monitoring, safe batch sizes, and reindex procedures.'},
  {id:'DOC-08',title:'Auth service failover guide',type:'Runbook',space:'Platform Engineering',owner:'Meera Joshi',updated:'Oct 10, 2026',status:'Synced',chunks:21,connected:16,summary:'EU auth failover, Redis pool reset, token refresh monitoring, and rollback guidelines.'},
  {id:'DOC-19',title:'Payment reconciliation architecture',type:'Architecture',space:'Payments',owner:'Samar Patel',updated:'Oct 08, 2026',status:'Needs review',chunks:31,connected:25,summary:'Partition processing, offsets and checkpoints, idempotency guarantees, and replay strategy.'},
  {id:'DOC-12',title:'Notification delivery SLO',type:'SLO',space:'Reliability',owner:'Meera Joshi',updated:'Oct 07, 2026',status:'Synced',chunks:9,connected:7,summary:'Delivery latency objectives, escalation paths, queue depth thresholds, and scaling policy.'},
]

export const teamSeed = [
  {id:'u1',name:'Krish Chhabra',email:'krish@graphops.dev',role:'Owner',team:'Platform',status:'Active',lastActive:'Now',initials:'KC',color:'#b9f56a'},
  {id:'u2',name:'Ananya Rao',email:'ananya@graphops.dev',role:'Admin',team:'Payments',status:'Active',lastActive:'5 min ago',initials:'AR',color:'#a78bfa'},
  {id:'u3',name:'Samar Patel',email:'samar@graphops.dev',role:'Engineer',team:'Payments',status:'Active',lastActive:'18 min ago',initials:'SP',color:'#61c8f3'},
  {id:'u4',name:'Meera Joshi',email:'meera@graphops.dev',role:'Engineer',team:'Platform',status:'Active',lastActive:'32 min ago',initials:'MJ',color:'#f4a261'},
  {id:'u5',name:'Arjun Das',email:'arjun@graphops.dev',role:'Viewer',team:'Commerce',status:'Pending',lastActive:'Invitation sent',initials:'AD',color:'#ff9eaa'},
  {id:'u6',name:'Rhea Nair',email:'rhea@graphops.dev',role:'Engineer',team:'Discovery',status:'Active',lastActive:'1 hr ago',initials:'RN',color:'#57e0b0'},
]

export const integrationsSeed = [
  {id:'github',name:'GitHub',category:'Code & deployments',description:'Connect repositories, pull requests, commits, and deployment events.',connected:true,detail:'acme / 8 repositories',icon:'github',color:'#e6edf3'},
  {id:'datadog',name:'Datadog',category:'Observability',description:'Bring in metrics, monitors, traces, and incident context.',connected:true,detail:'3 monitors active',icon:'activity',color:'#a78bfa'},
  {id:'pagerduty',name:'PagerDuty',category:'Incident management',description:'Sync on-call alerts and incident status updates.',connected:true,detail:'Connected workspace',icon:'bell-ring',color:'#57e0b0'},
  {id:'slack',name:'Slack',category:'Communication',description:'Send investigation summaries and approval requests to Slack.',connected:false,detail:'Not connected',icon:'message-square',color:'#f4a261'},
  {id:'linear',name:'Linear',category:'Project management',description:'Create follow-up issues from verified root causes.',connected:false,detail:'Not connected',icon:'layout-list',color:'#8bc9ff'},
  {id:'sentry',name:'Sentry',category:'Observability',description:'Correlate exceptions with deployments and service dependencies.',connected:false,detail:'Not connected',icon:'bug',color:'#ff9eaa'},
]

export const graphNodes = [
  {id:'checkout-api',label:'checkout-api',type:'Service',x:46,y:42,color:'#b9f56a',size:19},
  {id:'payment-gateway',label:'payment-gateway',type:'Service',x:72,y:28,color:'#57e0b0',size:15},
  {id:'deploy-42',label:'Deployment #42',type:'Deployment',x:25,y:23,color:'#a78bfa',size:13},
  {id:'payment-sdk',label:'payment-sdk v3.2',type:'Dependency',x:86,y:53,color:'#f4a261',size:16},
  {id:'inc-2410',label:'INC-2410',type:'Incident',x:57,y:72,color:'#ff9eaa',size:13},
  {id:'fix-rollback',label:'Rollback v3.1.8',type:'Fix',x:28,y:74,color:'#b9f56a',size:12},
  {id:'orders-db',label:'orders-db',type:'Database',x:14,y:51,color:'#8bc9ff',size:12},
  {id:'ananya',label:'Ananya Rao',type:'Person',x:74,y:84,color:'#a78bfa',size:11},
  {id:'runbook',label:'Checkout runbook',type:'Document',x:46,y:15,color:'#8bc9ff',size:12},
  {id:'contract-tests',label:'Contract tests',type:'Tool',x:10,y:85,color:'#57e0b0',size:10},
  {id:'auth-service',label:'auth-service',type:'Service',x:89,y:15,color:'#57e0b0',size:11},
]
export const graphEdges = [
  ['checkout-api','payment-gateway','CALLS'],['checkout-api','deploy-42','DEPLOYED_IN'],['checkout-api','orders-db','WRITES_TO'],['checkout-api','inc-2410','AFFECTED_BY'],['payment-gateway','payment-sdk','USES'],['payment-sdk','inc-2410','CAUSED_SUSPECTED'],['inc-2410','fix-rollback','RESOLVED_BY'],['fix-rollback','contract-tests','VERIFIED_WITH'],['ananya','checkout-api','OWNS'],['runbook','checkout-api','DOCUMENTS'],['auth-service','checkout-api','AUTHENTICATES']
]

export const activitySeed = [
  {id:1,icon:'search',color:'blue',title:'Investigation started',description:'Incident Investigator began INC-2481 analysis',time:'2 min ago',actor:'System'},
  {id:2,icon:'git-commit',color:'purple',title:'Deployment detected',description:'checkout-api v2.18.4 deployed to production',time:'7 min ago',actor:'GitHub'},
  {id:3,icon:'brain-circuit',color:'green',title:'Memory retrieved',description:'Found 3 related memories with 94%+ confidence',time:'8 min ago',actor:'Memory Analyst'},
  {id:4,icon:'check-circle',color:'green',title:'Investigation resolved',description:'INC-2472 closed with verified recovery steps',time:'2 hr ago',actor:'Meera Joshi'},
]

export const latencyData = [
  {time:'20:00',latency:108,errors:0.2},{time:'21:00',latency:114,errors:0.25},{time:'22:00',latency:116,errors:0.3},{time:'23:00',latency:120,errors:0.5},{time:'00:00',latency:124,errors:0.4},{time:'01:00',latency:128,errors:0.7},{time:'01:30',latency:142,errors:1.2},{time:'02:00',latency:186,errors:2.3},{time:'02:30',latency:412,errors:3.8},{time:'03:00',latency:378,errors:3.1}
]
export const runTrendData = [
  {day:'Oct 09',success:82,failed:8},{day:'Oct 10',success:89,failed:5},{day:'Oct 11',success:91,failed:6},{day:'Oct 12',success:94,failed:4},{day:'Oct 13',success:90,failed:7},{day:'Oct 14',success:96,failed:3},{day:'Oct 15',success:97,failed:2}
]
