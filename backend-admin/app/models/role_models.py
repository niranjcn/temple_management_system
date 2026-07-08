from pydantic import BaseModel, Field, ConfigDict
from typing import List
from bson import ObjectId
from .main_models import PyObjectId


class RoleBase(BaseModel):
    role_id: int = Field(..., description="Numeric role identifier")
    role_name: str = Field(..., description="Human readable role name")
    basic_permissions: List[str] = Field(default_factory=list, description="Default permissions for the role")


class RoleInDB(RoleBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, json_encoders={ObjectId: str})
