import React from 'react';
import { ShieldOff } from 'lucide-react';
import { Card } from '../ui/Card';
import { PERMISSION_DENIED_MESSAGE } from '../../constants/permissions';

export const PermissionDenied = () => (
  <Card className="mx-auto max-w-xl text-center">
    <ShieldOff className="mx-auto mb-4 text-amber-600" size={40} />
    <p className="font-bold text-gray-700">{PERMISSION_DENIED_MESSAGE}</p>
  </Card>
);
