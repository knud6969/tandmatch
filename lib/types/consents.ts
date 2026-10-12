import type { ConsentType } from "@/lib/types/common";

export type GrantedConsentDto = { id: string; type: ConsentType; grantedAt: string };

export type WithdrawResultDto = {
  withdrawnAt: string;
  deletedImages: number;
  // Antal leads, der blev trukket tilbage ved tilbagetrækning af health_data_sharing (architecture 5.3, 10.3).
  withdrawnLeads: number;
  sessionDeleted: boolean;
};

export type ConsentDto = {
  id: string;
  type: ConsentType;
  textVersion: string;
  grantedAt: string;
  grantedWhileAnonymous: boolean;
  withdrawnAt: string | null;
};
