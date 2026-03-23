export enum UserRole {
  ADMIN      = 'admin',
  CREATOR    = 'creator',
  APPROVER_1 = 'approver_1',
  APPROVER_2 = 'approver_2',
}

export enum UserStatus {
  ACTIVE    = 'active',
  INACTIVE  = 'inactive',
  SUSPENDED = 'suspended',
}

export enum PensionStatus {
  ACTIVE     = 'active',
  SUSPENDED  = 'suspended',
  TERMINATED = 'terminated',
  DECEASED   = 'deceased',
}

export enum PaymentStatus {
  PENDING    = 'pending',
  SUBMITTED  = 'submitted',
  APPROVED_1 = 'approved_1',
  APPROVED_2 = 'approved_2',
  PROCESSED  = 'processed',
  FAILED     = 'failed',
  REVERSED   = 'reversed',
}

export enum GratuityType {
  FULL    = 'full',
  PARTIAL = 'partial',
  DEATH   = 'death',
}

export enum GratuityStatus {
  PENDING    = 'pending',
  SUBMITTED  = 'submitted',
  APPROVED_1 = 'approved_1',
  APPROVED_2 = 'approved_2',
  PAID       = 'paid',
  REJECTED   = 'rejected',
}

export enum ArrearStatus {
  PENDING   = 'pending',
  APPROVED  = 'approved',
  PAID      = 'paid',
  CANCELLED = 'cancelled',
}

export enum WorkflowAction {
  CREATED    = 'created',
  SUBMITTED  = 'submitted',
  APPROVED_1 = 'approved_1',
  APPROVED_2 = 'approved_2',
  REJECTED   = 'rejected',
  REVERSED   = 'reversed',
  PAID       = 'paid',
  CANCELLED  = 'cancelled',
}
