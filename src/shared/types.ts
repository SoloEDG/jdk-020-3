export type ServiceKind = "baggage" | "fuel" | "clean";
export type VehicleKind = ServiceKind | "tow" | "repair";
export type FlightStatus =
  "scheduled" | "incoming" | "parked" | "departing" | "departed";
export type ServiceStatus =
  "pending" | "travel" | "working" | "done" | "interrupted";
export type VehicleStatus =
  | "idle"
  | "waiting"
  | "travel"
  | "working"
  | "returning"
  | "recovering"
  | "failed"
  | "staged"
  | "maintenance";
export type FailureType = "drive" | "equipment";
export type Journey =
  | "service"
  | "return"
  | "tow"
  | "towToBay"
  | "selfToBay"
  | "repairToBay";
export type RepairMode = "preventive" | "corrective";
export type RepairState = "queued" | "active";
export interface Point {
  x: number;
  y: number;
}
export interface Flight {
  id: string;
  airline: string;
  from: string;
  destination: string;
  aircraft: string;
  size: "narrow" | "wide";
  arrival: number;
  deadline: number;
  passengers: number;
  status: FlightStatus;
  standId?: string;
  departureAt?: number;
  color: string;
  /** 紧急航班：可以冒险派出高磨损车辆，风险只提示区间。 */
  urgent?: boolean;
}
export interface Stand extends Point {
  id: string;
  size: "narrow" | "wide";
  terminal: string;
}
export interface Completion {
  at: number;
  vehicleId: string;
}
export interface Service {
  id: string;
  flightId: string;
  kind: ServiceKind;
  status: ServiceStatus;
  progress: number;
  duration: number;
  vehicleId?: string;
  /** 只有真实完成才写入；离港判定只认这个凭证，换车不会伪造完成。 */
  completion?: Completion;
  /** 故障中断时记录成果能否由替代车接续，仅用于解释，不作为完成凭证。 */
  handover?: boolean;
}
export interface Wear {
  travel: number;
  work: number;
}
export interface Failure {
  type: FailureType;
  at: number;
  /** 故障发生时的真实位置，拖救后仍保留，便于追溯。 */
  position: Point;
  /** equipment 故障的作业成果可由替代车接续；drive 故障不可以。 */
  handover: boolean;
  /** 是否失去行驶能力，需要拖救车。 */
  stranded: boolean;
  /** 故障发生时是否占用机坪通道。 */
  onLane: boolean;
  /** 故障时的作业任务；设备故障的成果可交替代车。 */
  taskId?: string;
  /** 该故障被拖往的工位。 */
  bayId?: string;
  towRequested?: boolean;
  atBay?: boolean;
}
export interface Vehicle {
  id: string;
  kind: VehicleKind;
  status: VehicleStatus;
  position: Point;
  origin: Point;
  target: Point;
  home: Point;
  progress: number;
  tripDuration: number;
  serviceId?: string;
  jobId?: string;
  currentBayId?: string;
  journey?: Journey;
  wear: Wear;
  failure?: Failure;
  /** 拖救车正在前往或正在拖带的目标车辆。 */
  towTargetId?: string;
}
export interface RepairJob {
  id: string;
  vehicleId: string;
  mode: RepairMode;
  failureType?: FailureType;
  queuedAt: number;
  state: RepairState;
  /** 备用件在工位开工时一次扣除，维修完成时不再结算，避免重复领取。 */
  spareReserved: boolean;
  bayId?: string;
  repairVehicleId?: string;
  duration: number;
  remaining: number;
  /** 紧急插队后向原排队车辆说明的预计延期秒数。 */
  notifiedDelay?: number;
  notifiedAt?: number;
  expedited?: boolean;
}
export interface MaintenanceBay {
  id: string;
  jobId?: string;
  vehicleId?: string;
  remaining?: number;
}
export interface Maintenance {
  spares: number;
  /** 累计领取的备用件（单调递增），用于防止存档恢复后重复领取。 */
  drawn: number;
  /** 累计补货的备用件（单调递增）。 */
  restocked: number;
  /** 已完成的维修任务数，与 drawn 对账。 */
  completedJobs: number;
  nextRestock: number;
  bays: MaintenanceBay[];
  jobs: RepairJob[];
}
export interface LaneState {
  /** 持有通道通行权的车辆，同一时刻不超过通道容量。 */
  permits: string[];
  /** 排队顺序，先到先得。 */
  queue: string[];
  /** 故障车停在通道中时整个通道保持阻断，直到拖救车将其移走。 */
  blockedBy?: string;
}
export interface Event {
  id: number;
  time: number;
  text: string;
  tone: "info" | "success" | "warning";
}
export interface Shift {
  version: 2;
  time: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  score: number;
  conflicts: number;
  /** 可复现的随机数状态，存档恢复后继续同一序列。 */
  rng: number;
  flights: Flight[];
  stands: Stand[];
  services: Service[];
  vehicles: Vehicle[];
  events: Event[];
  lane: LaneState;
  maintenance: Maintenance;
  nextJobId: number;
  selectedFlightId: string;
  selectedStandId?: string;
  selectedVehicleId?: string;
  nextEventId: number;
}
export type CommandResult = (state: Shift) => Shift;
