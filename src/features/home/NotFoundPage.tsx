import { Compass } from 'lucide-react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import page from '../../components/layout/page.module.css';

export function NotFoundPage(): ReactElement {
  const navigate = useNavigate();
  return (
    <div className={page.page}>
      <div className={page.inner}>
        <EmptyState
          icon={Compass}
          title="页面不存在"
          description="这个地址没有对应的页面。可以回到学习首页，或从课程目录继续。"
          actions={
            <>
              <Button variant="primary" onClick={() => navigate(ROUTES.home)}>
                回到学习首页
              </Button>
              <Button variant="secondary" onClick={() => navigate(ROUTES.courses)}>
                课程与笔记
              </Button>
            </>
          }
        />
      </div>
    </div>
  );
}
