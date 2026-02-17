/**
 * User and authentication types
 */

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
}

export interface UserPresence {
  id: string;
  name: string;
  color: string;
  cursor?: {
    x: number;
    y: number;
    lastUpdate: number;
  };
}
