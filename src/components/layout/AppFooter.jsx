import React from 'react';
import { APP_VERSION_LABEL } from '../../constants/appVersion';

export function AppFooter() {
  return <footer className="bg-gray-50 px-4 py-3 text-center text-[10px] font-medium text-gray-400 sm:text-xs">{APP_VERSION_LABEL}</footer>;
}
