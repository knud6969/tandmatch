import type { ConsentType } from "@/lib/types/common";

export type GrantedConsentDto = { id: string; type: ConsentType; grantedAt: string };

export type WithdrawResultDto = {
  withdrawnAt: string;
  deletedImages: number;
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
