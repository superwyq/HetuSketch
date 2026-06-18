import { Card, Empty, Typography } from 'antd';

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps): React.JSX.Element {
  return (
    <Card className="placeholder-card">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <Typography.Title level={3}>{title}</Typography.Title>
            <Typography.Paragraph>{description}</Typography.Paragraph>
          </div>
        }
      />
    </Card>
  );
}
