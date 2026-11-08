import React from 'react';

interface AdminDeviceGateProps {
  children: React.ReactNode;
  onNavigateHome?: () => void;
}

/**
 * Transparent Admin Device Gate.
 * Allows authenticated administrators to access the management portal from any device (phone, PC, laptop)
 * without device-locking restrictions.
 */
export const AdminDeviceGate: React.FC<AdminDeviceGateProps> = ({ children }) => {
  return <>{children}</>;
};
