// ─── Upload & Analysis Types ──────────────────────────────────────────────────
// Mirrors the Prisma models returned by the backend API.

export type UploadStatus = 'PENDING' | 'PARSING' | 'ANALYZING' | 'COMPLETE' | 'FAILED';
export type AnomalyType  = 'HIGH_REQUEST_RATE' | 'REPEATED_BLOCK' | 'THREAT_DETECTED' |
                           'HIGH_RISK_SCORE' | 'SUSPICIOUS_UA' | 'OFF_HOURS_ACCESS' |
                           'LARGE_TRANSFER' | 'MALICIOUS_CATEGORY';
export type Severity     = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface LogUpload {
  id:           string;
  originalName: string;
  fileSize:     number;
  status:       UploadStatus;
  totalEntries: number;
  errorMessage: string | null;
  createdAt:    string;
  updatedAt?:   string;
}

export interface Anomaly {
  id:              string;
  type:            AnomalyType;
  severity:        Severity;
  description:     string;
  confidenceScore: number;
  affectedIp:      string | null;
  affectedUser:    string | null;
  logEntryId:      string | null;
  details:         Record<string, unknown>;
  createdAt:       string;
}

export interface AnalysisHistoryEntry {
  id:             string;
  provider:       string;
  executiveSummary: string;
  totalRequests:  number;
  blockedRequests: number;
  threatCount:    number;
  anomalyCount:   number;
  createdAt:      string;
}

export interface AnalysisResult {
  id:                string;
  uploadId:          string;
  provider:          string;
  executiveSummary:  string;
  timeline:          TimelineEvent[];
  stats:             AggregatedStats;
  topThreats:        ThreatEntry[];
  socRecommendations: string[];
  totalRequests:     number;
  blockedRequests:   number;
  threatCount:       number;
  anomalyCount:      number;
  uniqueUsers:       number;
  uniqueIPs:         number;
  timeRangeStart:    string | null;
  timeRangeEnd:      string | null;
  createdAt:         string;
}

export interface TimelineEvent {
  time:  string;
  event: string;
}

export interface ThreatEntry {
  name:        string;
  count:       number;
  severity:    Severity;
  description: string;
}

export interface IpRiskRow {
  ip:           string;
  requests:     number;
  blocked:      number;
  threats:      number;
  anomalyTypes: string[];
}

export interface BlockedDestination {
  url:      string;
  category: string;
  count:    number;
}

export interface AggregatedStats {
  totalRequests:   number;
  blockedRequests: number;
  threatCount:     number;
  anomalyCount:    number;
  uniqueUsers:     number;
  uniqueIPs:       number;
  blockRate:       number;
  topIPs:          { ip: string; count: number }[];
  topCategories:   { category: string; count: number }[];
  ipRiskSummary:   IpRiskRow[];
  topBlockedDests: BlockedDestination[];
}

export interface LogEntry {
  id:             string;
  timestamp:      string;
  login:          string | null;
  cip:            string | null;
  sip:            string | null;
  action:         string | null;
  url:            string | null;
  urlsupercat:    string | null;
  urlcat:         string | null;
  threatname:     string | null;
  riskscore:      number | null;
  threatseverity: string | null;
  reqmethod:      string | null;
  respcode:       string | null;
  ua:             string | null;
  appname:        string | null;
  isAnomalous:    boolean;
  respdatasize:   number | null;
  dept:           string | null;
  location:       string | null;
  anomalyTypes:   string[];
}

export interface Pagination {
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}
