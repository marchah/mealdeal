import type { Maybe } from '../../common/types';

/** A merchant newsletter users can sign up for. */
export interface Newsletter {
  id: string;
  merchantId: string;
  name: string;
  signupUrl: string;
  recommended: boolean;
}

export interface AddNewsletterInput {
  merchantId: string;
  name: string;
  signupUrl: string;
  recommended: boolean;
}

export interface NewsletterRepository {
  findById(id: string): Promise<Maybe<Newsletter>>;
  create(input: AddNewsletterInput): Promise<Newsletter>;
  remove(id: string): Promise<boolean>;
}

export interface NewsletterService {
  getNewsletter(id: string): Promise<Newsletter>;
  addNewsletter(input: AddNewsletterInput): Promise<Newsletter>;
  removeNewsletter(id: string): Promise<Newsletter>;
}
