// components/LoadingSpinner.js
import { memo } from 'react';

const LoadingSpinner = memo(({ size = 'md', text = 'Caricamento...', className = '' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16'
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg'
  };

  return (
    <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
      <div 
        className={`${sizeClasses[size]} animate-spin rounded-full border-4 border-gray-200 border-t-emerald-600`}
        role="status"
        aria-label="Caricamento in corso"
      />
      {text && (
        <p className={`mt-4 ${textSizes[size]} text-gray-600 font-medium`}>
          {text}
        </p>
      )}
      <span className="sr-only">Caricamento in corso</span>
    </div>
  );
});

LoadingSpinner.displayName = 'LoadingSpinner';

export default LoadingSpinner;
