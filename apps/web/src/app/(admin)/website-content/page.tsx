'use client';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

export default function WebsiteContentAdmin(){
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['content'],
    queryFn: async ()=> (await api.get('/admin/content?type=page')).data
  });
  // … render list + open Modal to create/edit; call POST/PUT, refetch
  return <div>TODO: content list</div>;
}
