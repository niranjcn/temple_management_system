from typing import Any
from bson import ObjectId
from pydantic_core import core_schema
from pydantic.json_schema import JsonSchemaValue
from pydantic import GetCoreSchemaHandler, GetJsonSchemaHandler

# --- Custom ObjectId Validator for Pydantic V2 ---
# Ensures that MongoDB's ObjectId is correctly validated and
# serialized as a string in API responses. This is a shared utility.
class PyObjectId(ObjectId):
    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: Any, handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        def validate(value: str) -> ObjectId:
            if not ObjectId.is_valid(value):
                raise ValueError("Invalid ObjectId")
            return ObjectId(value)

        instance_schema = core_schema.is_instance_schema(ObjectId)
        string_schema = core_schema.chain_schema(
            [core_schema.str_schema(), core_schema.no_info_plain_validator_function(validate)]
        )
        return core_schema.union_schema(
            [instance_schema, string_schema],
            serialization=core_schema.plain_serializer_function_ser_schema(str),
        )

    @classmethod
    def __get_pydantic_json_schema__(
        cls, _core_schema: core_schema.CoreSchema, handler: GetJsonSchemaHandler
    ) -> JsonSchemaValue:
        return handler(core_schema.str_schema())
