import { DeleteOutlined, DownloadOutlined, EditOutlined, FolderOpenOutlined, ImportOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Form, Input, List, Modal, Popconfirm, Select, Space, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import type { ProjectCreateInput, ProjectManifest } from '@shared/storageTypes';
import { useAppStore } from '../store/appStore';

export function ProjectsPage(): React.JSX.Element {
  const [form] = Form.useForm<ProjectCreateInput>();
  const [editForm] = Form.useForm<ProjectCreateInput>();
  const selectedProject = useAppStore((state) => state.selectedProject);
  const setSelectedProject = useAppStore((state) => state.setSelectedProject);
  const [projects, setProjects] = useState<ProjectManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectManifest>();
  const [error, setError] = useState<string>();

  const loadProjects = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await window.hetuSketch.projects.list();
      setProjects(next);
      if (!useAppStore.getState().selectedProject && next[0]) {
        setSelectedProject(next[0]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '作品列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [setSelectedProject]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const createProject = async (values: ProjectCreateInput): Promise<void> => {
    setSaving(true);
    try {
      const project = await window.hetuSketch.projects.create({ ...values, summary: values.summary ?? '' });
      setSelectedProject(project);
      form.resetFields();
      message.success('作品已创建');
      await loadProjects();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '作品创建失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async (projectId: string): Promise<void> => {
    await window.hetuSketch.projects.delete(projectId);
    if (selectedProject?.id === projectId) {
      setSelectedProject(undefined);
    }
    message.success('作品已删除');
    await loadProjects();
  };

  const startEdit = (project: ProjectManifest): void => {
    setEditingProject(project);
    editForm.setFieldsValue({ name: project.name, type: project.type, summary: project.summary });
  };

  const updateProject = async (values: ProjectCreateInput): Promise<void> => {
    if (!editingProject) return;
    setSaving(true);
    try {
      const project = await window.hetuSketch.projects.update({ projectId: editingProject.id, ...values });
      if (selectedProject?.id === project.id) {
        setSelectedProject(project);
      }
      setEditingProject(undefined);
      message.success('作品已更新');
      await loadProjects();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '作品更新失败');
    } finally {
      setSaving(false);
    }
  };

  const exportProject = async (projectId: string): Promise<void> => {
    const result = await window.hetuSketch.projects.export(projectId);
    if (result) {
      message.success(`作品已导出：${result.destinationPath}`);
    }
  };

  const importProject = async (source: 'folder' | 'zip'): Promise<void> => {
    const result = source === 'folder' ? await window.hetuSketch.projects.importFolder() : await window.hetuSketch.projects.importZip();
    if (result) {
      setSelectedProject(result.project);
      message.success(`已导入作品：${result.project.name}`);
      await loadProjects();
    }
  };

  return (
    <Space direction="vertical" size="large" className="page-stack">
      <Card className="page-title-card">
        <Typography.Title level={2}>作品管理</Typography.Title>
        <Typography.Paragraph type="secondary">作品是角色、世界观和伏笔线索的本地容器。创建后会初始化 JSON/Markdown 事实源与 SQLite 索引。</Typography.Paragraph>
      </Card>

      {error && <Alert showIcon type="error" message="加载失败" description={error} />}

      <Card title="新建作品" className="feature-card">
        <Form form={form} layout="vertical" onFinish={(values) => void createProject(values)}>
          <Form.Item name="name" label="作品名称" rules={[{ required: true, message: '请输入作品名称' }, { max: 60, message: '作品名称不超过 60 字' }]}>
            <Input placeholder="例如：雾海纪元" />
          </Form.Item>
          <Form.Item name="type" label="作品类型" initialValue="original" rules={[{ required: true, message: '请选择作品类型' }]}>
            <Select options={[{ value: 'original', label: '原创' }, { value: 'fanfiction', label: '同人' }]} />
          </Form.Item>
          <Form.Item name="summary" label="简介" rules={[{ max: 500, message: '简介不超过 500 字' }]}>
            <Input.TextArea rows={3} placeholder="一句话记录题材、核心冲突或世界基调" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={saving}>创建作品</Button>
        </Form>
      </Card>

      <Card
        title="本地作品"
        className="feature-card"
        extra={(
          <Space wrap>
            <Button icon={<ImportOutlined />} onClick={() => void importProject('folder')}>导入目录</Button>
            <Button icon={<ImportOutlined />} onClick={() => void importProject('zip')}>导入 Zip</Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadProjects()}>刷新</Button>
          </Space>
        )}
      >
        <List
          loading={loading}
          dataSource={projects}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无作品，先创建一个创作项目" /> }}
          renderItem={(project) => (
            <List.Item
              actions={[
                <Button key="open" type={selectedProject?.id === project.id ? 'primary' : 'default'} icon={<FolderOpenOutlined />} onClick={() => setSelectedProject(project)}>设为当前</Button>,
                <Button key="edit" icon={<EditOutlined />} onClick={() => startEdit(project)}>编辑</Button>,
                <Button key="export" icon={<DownloadOutlined />} onClick={() => void exportProject(project.id)}>导出</Button>,
                <Popconfirm key="delete" title="删除作品" description="会删除本地作品目录，请确认已备份。" onConfirm={() => void deleteProject(project.id)}>
                  <Button danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              ]}
            >
              <List.Item.Meta
                title={<Space><span>{project.name}</span>{selectedProject?.id === project.id && <Tag color="volcano">当前</Tag>}<Tag>{project.type === 'original' ? '原创' : '同人'}</Tag></Space>}
                description={project.summary || `更新于 ${new Date(project.updatedAt).toLocaleString()}`}
              />
            </List.Item>
          )}
        />
      </Card>

      <Modal
        title="编辑作品"
        open={Boolean(editingProject)}
        onCancel={() => setEditingProject(undefined)}
        onOk={() => editForm.submit()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={(values) => void updateProject(values)}>
          <Form.Item name="name" label="作品名称" rules={[{ required: true, message: '请输入作品名称' }, { max: 60, message: '作品名称不超过 60 字' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="作品类型" rules={[{ required: true, message: '请选择作品类型' }]}>
            <Select options={[{ value: 'original', label: '原创' }, { value: 'fanfiction', label: '同人' }]} />
          </Form.Item>
          <Form.Item name="summary" label="简介" rules={[{ max: 500, message: '简介不超过 500 字' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
