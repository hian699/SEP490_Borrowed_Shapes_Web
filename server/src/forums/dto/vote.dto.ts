import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VoteDto {
  @ApiProperty({
    enum: [1, -1],
    example: 1,
    description: '1 for upvote, -1 for downvote',
  })
  @IsIn([1, -1], { message: 'forum.vote_value_invalid' })
  value!: 1 | -1;
}