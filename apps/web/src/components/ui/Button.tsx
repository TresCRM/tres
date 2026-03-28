'use client';
import { ComponentPropsWithRef, ElementType, forwardRef } from 'react';
import clsx from 'clsx';

type Variants = 'primary'|'secondary'|'ghost'|'outline'|'danger';
type Sizes = 'sm'|'md'|'lg';

type Props<T extends ElementType> = {
  as?: T;
  variant?: Variants;
  size?: Sizes;
  block?: boolean;
} & Omit<ComponentPropsWithRef<T>, 'as'>;

const base = 'inline-flex items-center justify-center rounded-md font-medium transition-all';
const sizes: Record<Sizes,string> = {
  sm:'h-8 px-3 text-sm', md:'h-10 px-4 text-sm', lg:'h-12 px-5 text-base'
};
const variants: Record<Variants,string> = {
  primary: 'bg-[var(--brand-primary)] text-white hover:opacity-90 shadow',
  secondary: 'bg-gray-900 text-white hover:bg-gray-800',
  ghost: 'bg-transparent hover:bg-gray-100',
  outline: 'border hover:bg-gray-50',
  danger: 'bg-red-600 text-white hover:bg-red-500'
};

export const Button = forwardRef(function Button<T extends ElementType = 'button'>(
  { as, className, variant='primary', size='md', block=false, ...props }: Props<T>,
  ref: any
){
  const Comp = (as || 'button') as ElementType;
  return (
    <Comp ref={ref} className={clsx(base, sizes[size], variants[variant], block && 'w-full', className)} {...props} />
  );
});
