import { useQuery } from '@tanstack/react-query';

import * as api from './api';

export function useTeacherClasses(from: string, to: string) {
  return useQuery({
    queryKey: ['teacher-classes', from, to],
    queryFn: () => api.fetchClasses(from, to),
  });
}

export function useTeacherStudents() {
  return useQuery({ queryKey: ['teacher-students'], queryFn: api.fetchStudents });
}
