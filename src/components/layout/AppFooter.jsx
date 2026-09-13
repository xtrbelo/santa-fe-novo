import React from 'react';
import { APP_VERSION_LABEL } from '../../constants/appVersion';

export function AppFooter() {
  return <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-2 text-center text-[10px] font-bold text-gray-600 backdrop-blur sm:text-xs lg:left-72">{APP_VERSION_LABEL}</footer>;
}
