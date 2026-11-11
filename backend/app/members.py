import os

import psycopg
from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row

from .models import MemberDirectoryResponse, MemberResponse


router = APIRouter(prefix="/members", tags=["Members"])


@router.get("", response_model=list[MemberDirectoryResponse])
def list_members(q: str = "") -> list[MemberDirectoryResponse]:
    needle = q.strip().lower()
    digits = "".join(character for character in needle if character.isdigit())
    try:
        with psycopg.connect(
            os.environ["DATABASE_URL"],
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
                query = """
                    SELECT member_id, full_name, phone, membership_plan, membership_expires_on
                    FROM members
                """
                params: tuple[str, ...] = ()
                if needle:
                    query += " WHERE LOWER(full_name) LIKE %s"
                    params = (f"%{needle}%",)
                    if digits:
                        query += " OR regexp_replace(phone, '[^0-9]', '', 'g') LIKE %s"
                        params += (f"%{digits}%",)
                query += " ORDER BY full_name, member_id"
                cursor.execute(query, params)
                rows = cursor.fetchall()
        return [MemberDirectoryResponse(**row) for row in rows]
    except psycopg.Error:
        raise HTTPException(status_code=503, detail="Member service unavailable.") from None


@router.get("/{member_id}", response_model=MemberResponse)
def get_member(member_id: int) -> MemberResponse:
    try:
        with psycopg.connect(
            os.environ["DATABASE_URL"],
            row_factory=dict_row,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        member_id,
                        full_name,
                        email,
                        phone,
                        qr_code_token,
                        membership_plan,
                        membership_expires_on,
                        created_at
                    FROM members
                    WHERE member_id = %s
                    """,
                    (member_id,),
                )

                member = cursor.fetchone()

        if member is None:
            raise HTTPException(
                status_code=404,
                detail="Member not found.",
            )

        return MemberResponse(**member)

    except HTTPException:
        raise
    except psycopg.Error:
        raise HTTPException(
            status_code=503,
            detail="Member service unavailable.",
        ) from None
