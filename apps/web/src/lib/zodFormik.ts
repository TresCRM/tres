import { ZodSchema } from 'zod';
export const zodToFormikValidate = (schema: ZodSchema<any>) =>
  (values: any) => {
    const res = schema.safeParse(values);
    if (res.success) return {};
    return res.error.issues.reduce((acc, i) => {
      const k = i.path.join('.') || 'form';
      acc[k] = i.message;
      return acc;
    }, {} as Record<string,string>);
  };
