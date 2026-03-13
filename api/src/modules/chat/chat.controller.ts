import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('conversations')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  getConversations(@Query('userId') userId: string) {
    return this.chatService.getConversationsByUser(userId);
  }

  @Post()
  getOrCreate(@Body() body: { userId: string; characterId: string }) {
    return this.chatService.getOrCreateConversation(body.userId, body.characterId);
  }

  @Get(':id/messages')
  getMessages(@Param('id') id: string) {
    return this.chatService.getMessages(id);
  }
}
