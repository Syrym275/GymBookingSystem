import os

import psycopg
from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row

from .models import MemberResponse


router = APIRouter(prefix="/members", tags=["Members"])


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