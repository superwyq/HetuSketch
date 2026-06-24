import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc.js';
import type { AiValidationRequest, SettingCompletionRequest } from '../../shared/storageTypes.js';
import type { IpcRegistrationContext } from './types.js';
import { asAiConnectionKind, asArray, asObject, asOptionalString, asRagQueryRequest, asRequiredString, asValidationRequest } from './validators.js';

export function registerAiIpc({ storageService }: IpcRegistrationContext): void {
  ipcMain.handle(IPC_CHANNELS.aiConfigGet, () => storageService.getAiConfig());
  ipcMain.handle(IPC_CHANNELS.aiConfigSave, (_event, input: unknown) => storageService.saveAiConfig(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.aiConnectionTest, (_event, kind: unknown, input: unknown) =>
    storageService.testAiConnection(asAiConnectionKind(kind), input && typeof input === 'object' && !Array.isArray(input) ? asObject(input) : undefined)
  );
  ipcMain.handle(IPC_CHANNELS.aiPromptsGet, () => storageService.getAiPrompts());
  ipcMain.handle(IPC_CHANNELS.aiPromptsSave, (_event, input: unknown) => storageService.saveAiPrompts(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.aiSkillsList, () => storageService.listAiSkills());
  ipcMain.handle(IPC_CHANNELS.aiSkillsSave, (_event, input: unknown) => storageService.saveAiSkills(asArray(input)));
  ipcMain.handle(IPC_CHANNELS.aiHttpToolsList, () => storageService.listHttpTools());
  ipcMain.handle(IPC_CHANNELS.aiHttpToolsSave, (_event, input: unknown) => storageService.saveHttpTool(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.aiHttpToolsDelete, (_event, toolId: unknown) => storageService.deleteHttpTool(asRequiredString(toolId, 'toolId')));
  ipcMain.handle(IPC_CHANNELS.agentList, () => storageService.listAgents());
  ipcMain.handle(IPC_CHANNELS.agentGet, (_event, id: unknown) => storageService.getAgent(asRequiredString(id, 'agentId')));
  ipcMain.handle(IPC_CHANNELS.agentCreate, (_event, input: unknown) => storageService.createAgent(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.agentUpdate, (_event, input: unknown) => storageService.updateAgent(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.agentDelete, (_event, id: unknown) => storageService.deleteAgent(asRequiredString(id, 'agentId')));
  ipcMain.handle(IPC_CHANNELS.agentReorder, (_event, input: unknown) => storageService.reorderAgents(asArray(input)));
  ipcMain.handle(IPC_CHANNELS.ragBuild, (_event, projectId: unknown) => storageService.buildVectorIndex(asRequiredString(projectId, 'projectId')));
  ipcMain.handle(IPC_CHANNELS.ragState, (_event, projectId: unknown) => storageService.getVectorIndexState(asRequiredString(projectId, 'projectId')));
  ipcMain.handle(IPC_CHANNELS.ragQuery, (_event, request: unknown) => storageService.ragQuery(asRagQueryRequest(request)));
  ipcMain.handle(IPC_CHANNELS.ragAnswer, (_event, request: unknown) => storageService.ragAnswer(asRagQueryRequest(request)));
  ipcMain.handle(IPC_CHANNELS.aiSettingComplete, (_event, request: unknown) => storageService.completeSetting(asObject(request)));
  ipcMain.handle(IPC_CHANNELS.aiForeshadowing, (_event, projectId: unknown, text: unknown, requestId: unknown) =>
    storageService.foreshadowingReminder(asRequiredString(projectId, 'projectId'), typeof text === 'string' ? text.slice(0, 50_000) : '', asOptionalString(requestId))
  );

  ipcMain.handle(IPC_CHANNELS.aiModelsList, (_event, kind: unknown, input: unknown) =>
    storageService.listAiModels(kind === 'embedding' ? 'embedding' : 'llm', input && typeof input === 'object' && !Array.isArray(input) ? asObject(input) : undefined)
  );

  registerAiStreamIpc({ storageService });
}

function registerAiStreamIpc({ storageService }: IpcRegistrationContext): void {
  ipcMain.on(IPC_CHANNELS.aiStreamValidation, async (event, request: unknown) => {
    const req = request as Record<string, unknown>;
    const requestId = typeof req.requestId === 'string' ? req.requestId : '';
    const channel = (suffix: string) => `${IPC_CHANNELS.aiStreamValidation}:${suffix}:${requestId}`;
    try {
      const validationRequest = asValidationRequest(request) as AiValidationRequest;
      validationRequest.requestId = requestId;
      const basic = await storageService.validateContent(validationRequest);
      for await (const chunk of storageService.streamValidation(validationRequest, basic)) {
        event.sender.send(channel('chunk'), chunk);
      }
      event.sender.send(channel('end'));
    } catch (error) {
      event.sender.send(channel('error'), error instanceof Error ? error.message : '流式校验失败');
    }
  });

  ipcMain.on(IPC_CHANNELS.aiStreamRagAnswer, async (event, request: unknown) => {
    const req = request as Record<string, unknown>;
    const requestId = typeof req.requestId === 'string' ? req.requestId : '';
    const channel = (suffix: string) => `${IPC_CHANNELS.aiStreamRagAnswer}:${suffix}:${requestId}`;
    try {
      const ragRequest = asRagQueryRequest(request);
      ragRequest.requestId = requestId;
      for await (const chunk of storageService.streamRagAnswer(ragRequest)) {
        event.sender.send(channel('chunk'), chunk);
      }
      event.sender.send(channel('end'));
    } catch (error) {
      event.sender.send(channel('error'), error instanceof Error ? error.message : '流式回答失败');
    }
  });

  ipcMain.on(IPC_CHANNELS.aiStreamCompleteSetting, async (event, request: unknown) => {
    const req = request as Record<string, unknown>;
    const requestId = typeof req.requestId === 'string' ? req.requestId : '';
    const channel = (suffix: string) => `${IPC_CHANNELS.aiStreamCompleteSetting}:${suffix}:${requestId}`;
    try {
      const completionRequest = request as SettingCompletionRequest;
      for await (const chunk of storageService.streamCompleteSetting(completionRequest)) {
        event.sender.send(channel('chunk'), chunk);
      }
      event.sender.send(channel('end'));
    } catch (error) {
      event.sender.send(channel('error'), error instanceof Error ? error.message : '流式补全失败');
    }
  });

  ipcMain.on(IPC_CHANNELS.aiStreamForeshadowing, async (event, projectId: unknown, text: unknown, requestId: unknown) => {
    const id = typeof requestId === 'string' ? requestId : '';
    const channel = (suffix: string) => `${IPC_CHANNELS.aiStreamForeshadowing}:${suffix}:${id}`;
    try {
      for await (const chunk of storageService.streamForeshadowingReminder(asRequiredString(projectId, 'projectId'), typeof text === 'string' ? text.slice(0, 50_000) : '', id)) {
        event.sender.send(channel('chunk'), chunk);
      }
      event.sender.send(channel('end'));
    } catch (error) {
      event.sender.send(channel('error'), error instanceof Error ? error.message : '流式伏笔提醒失败');
    }
  });
}
