from typing import Literal

from pydantic import BaseModel, Field


class CoachMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class CoachChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[CoachMessage] = Field(default_factory=list, max_length=12)


class CoachChatResponse(BaseModel):
    reply: str
    used_ai: bool
    data_summary: dict
